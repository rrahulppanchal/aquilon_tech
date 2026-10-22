export const dynamic = "force-dynamic"
import { LoginForm } from "@/components/workspace/login-form"
import { isConfigured } from "@/lib/env"
export default function Login() {
  return <LoginForm configured={isConfigured()} />
}
