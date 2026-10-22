-- One mailbox per company: read enquiries over IMAP, send quotes over SMTP.
-- The password is encrypted by the server (like the AI key) and never readable
-- by the tenant role.
create table fieldquote.company_mail_accounts (
  company_id uuid primary key references fieldquote.companies(id),
  email text not null check (length(email) between 3 and 250),
  username text not null check (length(username) between 1 and 250),
  imap_host text not null check (length(imap_host) between 1 and 253),
  imap_port integer not null check (imap_port in (143, 993)),
  smtp_host text not null check (length(smtp_host) between 1 and 253),
  smtp_port integer not null check (smtp_port in (25, 465, 587, 2525)),
  ciphertext text not null, nonce text not null, tag text not null,
  key_version integer not null default 1,
  updated_by uuid references fieldquote.users(id),
  updated_at timestamptz not null default now()
);
alter table fieldquote.company_mail_accounts enable row level security;
revoke all on fieldquote.company_mail_accounts from public;

-- Remember which email an enquiry came from, so the same email can't be
-- turned into two quotes.
alter table fieldquote.enquiries add column source_message_id text check (length(source_message_id) <= 500);
create unique index enquiries_source_message on fieldquote.enquiries(company_id, source_message_id) where source_message_id is not null;

-- Quotes sent to customers from the app.
create table fieldquote.quote_sends (
  id bigint generated always as identity primary key,
  company_id uuid not null references fieldquote.companies(id),
  quote_id uuid not null references fieldquote.quotes(id) on delete cascade,
  version integer not null,
  to_email text not null,
  sent_by uuid not null references fieldquote.users(id),
  sent_at timestamptz not null default now()
);
create index quote_sends_quote on fieldquote.quote_sends(company_id, quote_id, sent_at desc);
alter table fieldquote.quote_sends enable row level security;
create policy quote_sends_read on fieldquote.quote_sends for select to fieldquote_tenant using(company_id in (select company_id from fieldquote.memberships where user_id = fieldquote.current_user_id()));
revoke all on fieldquote.quote_sends from public;
grant select on fieldquote.quote_sends to fieldquote_tenant;
