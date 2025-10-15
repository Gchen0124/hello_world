import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  try {
    const { timelineId, branchIndex, editedYear, editedEvent } = await request.json()

    console.log("[v0] Adapting timeline predictions for branch", branchIndex, "year", editedYear)

    const supabase = await createClient()

    // Get user's timeline data
    const { data: timeline } = await supabase.from("timelines").select("current_age").eq("id", timelineId).single()

    if (!timeline) {
      return Response.json({ error: "Timeline not found" }, { status: 404 })
    }

    const { data: branch } = await supabase
      .from("possibility_branches")
      .select("branch_name")
      .eq("timeline_id", timelineId)
      .eq("branch_index", branchIndex)
      .single()

    const { data: mission } = await supabase
      .from("life_missions")
      .select("mission_text, success_metrics(metric_text)")
      .eq("timeline_id", timelineId)
      .eq("branch_index", branchIndex)
      .single()

    // Get past 7 years of events
    const past7YearsStart = Math.max(0, timeline.current_age - 7)
    const { data: pastEvents } = await supabase
      .from("events")
      .select("year, event_text")
      .eq("timeline_id", timelineId)
      .is("branch_index", null)
      .gte("year", past7YearsStart)
      .lte("year", timeline.current_age)
      .order("year")

    const { data: userEntries } = await supabase
      .from("events")
      .select("year, event_text, is_user_edited")
      .eq("timeline_id", timelineId)
      .eq("branch_index", branchIndex)
      .eq("is_prediction", false)
      .order("year")

    const { data: existingPredictions } = await supabase
      .from("events")
      .select("id, year, event_text")
      .eq("timeline_id", timelineId)
      .eq("branch_index", branchIndex)
      .eq("is_prediction", true)
      .eq("is_user_edited", false)
      .order("year")

    console.log(
      "[v0] Found",
      userEntries?.length || 0,
      "user entries and",
      existingPredictions?.length || 0,
      "AI predictions for branch",
      branchIndex,
    )

    // Build context for Gemini
    const pastEventsText = pastEvents?.map((e) => `Year ${e.year}: ${e.event_text}`).join("\n") || "No past events"
    const userEntriesText =
      userEntries?.map((e) => `Year ${e.year}: ${e.event_text}`).join("\n") || "No user entries yet"
    const missionText = mission?.mission_text || "No mission defined"
    const metricsText = mission?.success_metrics?.map((m: any) => m.metric_text).join(", ") || "No metrics defined"

    const prompt = `You are a life planning AI assistant. A user just edited an event in their future timeline.

**Context:**
- Branch/Possibility: ${branch?.branch_name || "Unknown"}
- Life Mission: ${missionText}
- Success Metrics: ${metricsText}
- Past 7 Years (Y${past7YearsStart}-Y${timeline.current_age}):
${pastEventsText}

**User's Future Plans (${branch?.branch_name}):**
${userEntriesText}

**Recent Edit:**
- Year ${editedYear}: ${editedEvent}

**Existing AI Predictions for this branch:**
${existingPredictions?.map((p) => `Year ${p.year}: ${p.event_text}`).join("\n") || "None"}

**Task:**
Based on this new edit at Year ${editedYear}, analyze how this change affects the timeline and suggest updated predictions for years BEFORE and AFTER this event. 

IMPORTANT RULES:
1. DO NOT modify or suggest changes to any user-entered events
2. ONLY suggest updates to AI-generated predictions
3. Focus on years within 3 years before and 5 years after the edited event
4. Ensure predictions align with the mission, metrics, and the new context
5. Keep predictions realistic and specific (max 15 words each)
6. If a prediction no longer makes sense, suggest removing it (don't include it in response)

Return your response as a JSON array of predictions:
[
  {"year": <number>, "event": "<prediction text>", "reason": "<why this makes sense>"}
]

Only include years where predictions should be updated or added. Return empty array [] if no changes needed.`

    const geminiApiKey = process.env.Gemini_API
    if (!geminiApiKey) {
      console.error("[v0] Gemini API key is missing")
      return Response.json({ error: "Gemini API key not configured" }, { status: 500 })
    }

    console.log("[v0] Calling Gemini API to adapt predictions...")

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
          },
        }),
      },
    )

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text()
      console.error("[v0] Gemini API error:", errorText)
      console.error("[v0] Gemini API status:", geminiResponse.status)
      return Response.json({ error: `Gemini API failed: ${geminiResponse.status} - ${errorText}` }, { status: 500 })
    }

    const geminiData = await geminiResponse.json()

    if (!geminiData.candidates || !geminiData.candidates[0] || !geminiData.candidates[0].content) {
      console.error("[v0] Invalid Gemini response structure:", JSON.stringify(geminiData))
      return Response.json({ error: "Invalid response from Gemini API" }, { status: 500 })
    }

    const responseText = geminiData.candidates[0].content.parts[0].text

    console.log("[v0] Gemini response:", responseText.substring(0, 300))

    // Parse JSON from response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      console.log("[v0] No predictions to update")
      return Response.json({ predictions: [], message: "No updates needed" })
    }

    const adaptedPredictions = JSON.parse(jsonMatch[0])

    // Update database: delete old predictions for these years and insert new ones
    const yearsToUpdate = adaptedPredictions.map((p: any) => p.year)

    if (yearsToUpdate.length > 0) {
      await supabase
        .from("events")
        .delete()
        .eq("timeline_id", timelineId)
        .eq("branch_index", branchIndex)
        .eq("is_prediction", true)
        .eq("is_user_edited", false) // Only delete non-user-edited predictions
        .in("year", yearsToUpdate)

      // Insert new predictions
      const newPredictions = adaptedPredictions.map((p: any) => ({
        timeline_id: timelineId,
        branch_index: branchIndex,
        year: p.year,
        event_text: p.event,
        is_prediction: true,
        is_user_edited: false,
      }))

      const { data: inserted } = await supabase.from("events").insert(newPredictions).select()

      console.log("[v0] Updated", inserted?.length || 0, "predictions for branch", branchIndex)

      return Response.json({
        predictions: inserted || [],
        adaptations: adaptedPredictions,
      })
    }

    return Response.json({ predictions: [], message: "No updates needed" })
  } catch (error) {
    console.error("[v0] Error adapting timeline:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    console.error("[v0] Error details:", errorMessage)
    return Response.json({ error: `Failed to adapt timeline: ${errorMessage}` }, { status: 500 })
  }
}
