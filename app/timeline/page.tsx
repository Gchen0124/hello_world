import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"

const LifetimeTimeline = dynamic(() => import("@/components/lifetime-timeline"), {
  loading: () => (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  ),
  ssr: false,
})

export default async function TimelinePage() {
  const supabase = await createClient()

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    redirect("/auth/login")
  }

  return <LifetimeTimeline userId={user.id} />
}
