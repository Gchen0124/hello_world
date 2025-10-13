import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import LifetimeTimeline from "@/components/lifetime-timeline"

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
