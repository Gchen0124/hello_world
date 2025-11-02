"use client"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchParams = useSearchParams()

  // Check for error from callback
  useEffect(() => {
    const errorParam = searchParams.get("error")
    if (errorParam) {
      setError(decodeURIComponent(errorParam))
    }
  }, [searchParams])

  const handleGoogleLogin = async () => {
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    console.log("[v0] Starting Google OAuth login")
    console.log("[v0] Redirect URL will be:", `${window.location.origin}/auth/callback`)

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) {
        console.error("[v0] OAuth error:", error)
        throw error
      }

      console.log("[v0] OAuth initiated successfully")
    } catch (error: unknown) {
      console.error("[v0] Login error:", error)
      setError(error instanceof Error ? error.message : "An error occurred")
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="font-serif text-3xl">{"Welcome Back"}</CardTitle>
          <CardDescription className="text-pretty">{"Sign in to access your lifetime timeline"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleGoogleLogin} className="w-full" disabled={isLoading} size="lg">
            {isLoading ? "Signing in..." : "Continue with Google"}
          </Button>
          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <p className="font-medium">{"Authentication Error"}</p>
              <p className="mt-1">{error}</p>
              <div className="mt-3 space-y-1 text-xs">
                <p className="font-medium">{"Configuration checklist:"}</p>
                <ul className="ml-4 list-disc space-y-1">
                  <li>{"Google OAuth is enabled in Supabase Dashboard → Authentication → Providers"}</li>
                  <li>{`Redirect URL is added: ${window.location.origin}/auth/callback`}</li>
                  <li>{"Google Cloud Console has the same redirect URL in Authorized redirect URIs"}</li>
                </ul>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
