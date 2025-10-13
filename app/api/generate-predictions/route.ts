import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Verify user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { timelineId, branchIndex, branchName, currentAge } = body

    // Verify timeline belongs to user
    const { data: timeline, error: timelineError } = await supabase
      .from("timelines")
      .select("*")
      .eq("id", timelineId)
      .eq("user_id", user.id)
      .single()

    if (timelineError || !timeline) {
      return NextResponse.json({ error: "Timeline not found" }, { status: 404 })
    }

    // Get past 7 years of events
    const pastStartYear = Math.max(0, currentAge - 7)
    const { data: pastEvents } = await supabase
      .from("events")
      .select("year, event_text")
      .eq("timeline_id", timelineId)
      .is("branch_index", null)
      .gte("year", pastStartYear)
      .lte("year", currentAge - 1)
      .order("year", { ascending: true })

    // Get user's future entries for this branch
    const { data: futureEntries } = await supabase
      .from("events")
      .select("year, event_text")
      .eq("timeline_id", timelineId)
      .eq("branch_index", branchIndex)
      .eq("is_prediction", false)
      .gte("year", currentAge)
      .order("year", { ascending: true })

    // Build context for Gemini
    const pastContext =
      pastEvents && pastEvents.length > 0
        ? pastEvents.map((e) => `Year ${e.year}: ${e.event_text}`).join("\n")
        : "No past events recorded"

    const futureContext =
      futureEntries && futureEntries.length > 0
        ? futureEntries.map((e) => `Year ${e.year}: ${e.event_text}`).join("\n")
        : "No future plans entered yet"

    const prompt = `You are a thoughtful life coach helping someone explore their future possibilities.

Life Path Theme: "${branchName}"
Current Age: ${currentAge}

Recent Past (Last 7 years):
${pastContext}

User's Plans for This Path:
${futureContext}

Based on the theme "${branchName}", the person's recent past, and their stated plans, generate 3-5 important milestone events that could realistically happen in their future on this life path. 

Requirements:
- Events should be between age ${currentAge} and 100
- Each event should be a single concise sentence (max 15 words)
- Events should align with the theme and build upon their past and stated plans
- Be realistic and thoughtful, not overly optimistic or pessimistic
- Spread events across different life stages (don't cluster them)

Return ONLY a JSON array of objects with this exact format:
[
  {"year": 35, "event": "Launch successful startup after years of preparation"},
  {"year": 42, "event": "Achieve financial independence milestone"}
]

Do not include any other text, explanations, or markdown formatting.`

    // Call Gemini API
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${process.env.Gemini_API}`,
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
            temperature: 0.8,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          },
        }),
      },
    )

    if (!geminiResponse.ok) {
      throw new Error("Gemini API request failed")
    }

    const geminiData = await geminiResponse.json()
    const generatedText = geminiData.candidates[0].content.parts[0].text

    // Parse the JSON response
    let predictions: Array<{ year: number; event: string }>
    try {
      // Remove markdown code blocks if present
      const cleanedText = generatedText.replace(/```json\n?|\n?```/g, "").trim()
      predictions = JSON.parse(cleanedText)
    } catch (parseError) {
      console.error("[v0] Failed to parse Gemini response:", generatedText)
      return NextResponse.json({ error: "Failed to parse predictions" }, { status: 500 })
    }

    // Save predictions to database
    const predictionInserts = predictions.map((pred) => ({
      timeline_id: timelineId,
      branch_index: branchIndex,
      year: pred.year,
      event_text: pred.event,
      is_prediction: true,
    }))

    const { data: insertedPredictions, error: insertError } = await supabase
      .from("events")
      .insert(predictionInserts)
      .select()

    if (insertError) {
      console.error("[v0] Error saving predictions:", insertError)
      return NextResponse.json({ error: "Failed to save predictions" }, { status: 500 })
    }

    return NextResponse.json({ predictions: insertedPredictions })
  } catch (error) {
    console.error("[v0] Error generating predictions:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
