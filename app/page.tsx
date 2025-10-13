import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"

export default async function Home() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect("/timeline")
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6 bg-gradient-to-b from-background to-muted/20">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <CardTitle className="font-serif text-4xl text-balance">{"Your Lifetime Timeline"}</CardTitle>
          <CardDescription className="text-pretty text-base">
            {"Track your past, explore your future. Visualize 100 years of possibilities with AI-powered insights."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/auth/login">
            <Button className="w-full" size="lg">
              {"Get Started"}
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
