-- Companies choose their AI provider and model. One active key per company;
-- any member may set it, and every change is audited.
alter table fieldquote.company_ai_credentials
  drop constraint company_ai_credentials_provider_check;
alter table fieldquote.company_ai_credentials
  add constraint company_ai_credentials_provider_check check (provider in ('anthropic','openai'));
alter table fieldquote.company_ai_credentials
  add column model text not null default 'claude-opus-5-5' check (length(model) between 1 and 100);
alter table fieldquote.company_ai_credentials
  add column updated_by uuid references fieldquote.users(id);
