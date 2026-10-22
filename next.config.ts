import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Mail libraries open sockets and use Node built-ins; load them as-is on the server.
  serverExternalPackages: ["imapflow", "mailparser", "nodemailer"],
}

export default nextConfig
