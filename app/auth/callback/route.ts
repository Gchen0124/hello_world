import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const error = requestUrl.searchParams.get("error")
  const error_description = requestUrl.searchParams.get("error_description")
  const origin = requestUrl.origin

  console.log("[v0] Auth callback received:", {
    hasCode: !!code,
    error,
    error_description,
    fullUrl: requestUrl.toString(),
  })

  // Handle OAuth errors from Supabase
  if (error) {
    console.error("[v0] OAuth error from Supabase:", error, error_description)
    return NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent(error_description || error)}`)
  }

  // Handle missing code
  if (!code) {
    console.error("[v0] No authorization code received")
    return NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent("No authorization code received")}`)
  }

  try {
    const supabase = await createClient()
    console.log("[v0] Exchanging code for session...")

    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (exchangeError) {
      console.error("[v0] Code exchange error:", exchangeError)
      return NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent(exchangeError.message)}`)
    }

    console.log("[v0] Session established successfully for user:", data.user?.email)

    // Redirect to timeline after successful auth
    return NextResponse.redirect(`${origin}/timeline`)
  } catch (err) {
    console.error("[v0] Unexpected error in auth callback:", err)
    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent("Authentication failed. Please try again.")}`,
    )
  }
}
