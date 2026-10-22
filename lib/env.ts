export function isConfigured() {
  return !!process.env.DATABASE_URL
}
export function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Server configuration missing: ${name}`)
  return value
}
