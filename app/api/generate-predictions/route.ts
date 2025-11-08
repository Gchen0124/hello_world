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
    const { timelineId, branchIndex, branchName, currentAge, userLanguage } = body

    console.log("[v0] Generating predictions for branch", branchIndex, "timeline", timelineId)
    console.log("[v0] User language detected:", userLanguage || "not specified")

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

    const { data: mission } = await supabase
      .from("life_missions")
      .select("mission_text, success_metrics(metric_text)")
      .eq("timeline_id", timelineId)
      .eq("branch_index", branchIndex)
      .single()

    const missionContext = mission?.mission_text
      ? `\nLife Mission for this path: "${mission.mission_text}"\nSuccess Metrics: ${mission.success_metrics?.map((m: any) => m.metric_text).join(", ") || "None"}`
      : ""

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

    const { data: allExistingEvents } = await supabase
      .from("events")
      .select("year, event_text, is_prediction, is_user_edited")
      .eq("timeline_id", timelineId)
      .eq("branch_index", branchIndex)
      .gte("year", currentAge)
      .order("year", { ascending: true })

    const userEnteredEvents = allExistingEvents?.filter((e) => !e.is_prediction || e.is_user_edited) || []
    const filledYears = new Set(allExistingEvents?.map((e) => e.year) || [])

    console.log(
      "[v0] Found",
      pastEvents?.length || 0,
      "past events,",
      userEnteredEvents.length,
      "user-entered future events, and",
      filledYears.size,
      "total filled years for branch",
      branchIndex,
    )

    // Build context for Gemini
    const pastContext =
      pastEvents && pastEvents.length > 0
        ? pastEvents.map((e) => `Year ${e.year}: ${e.event_text}`).join("\n")
        : "No past events recorded"

    const futureContext =
      userEnteredEvents.length > 0
        ? userEnteredEvents.map((e) => `Year ${e.year}: ${e.event_text}`).join("\n")
        : "No future plans entered yet"

    const detectLanguagePrompt = `Analyze the following text and detect its primary language. Return ONLY the ISO 639-1 language code (e.g., "en", "es", "zh", "fr", "de", "ja", "ko", "pt", "ar", "ru").

Text samples:
${
  pastEvents
    ?.slice(-3)
    .map((e) => e.event_text)
    .join("\n") || ""
}
${
  userEnteredEvents
    .slice(0, 3)
    .map((e) => e.event_text)
    .join("\n") || ""
}
${mission?.mission_text || ""}

Return only the language code, nothing else.`

    let detectedLanguage = userLanguage || "en"

    if (pastEvents?.length || userEnteredEvents.length || mission?.mission_text) {
      try {
        const geminiApiKey = process.env.Gemini_API
        if (!geminiApiKey) {
          console.error("[v0] Gemini API key is missing")
          return NextResponse.json({ error: "Gemini API key not configured" }, { status: 500 })
        }

        const langDetectResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiApiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: detectLanguagePrompt }] }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 10 },
            }),
          },
        )

        if (langDetectResponse.ok) {
          const langData = await langDetectResponse.json()
          const langCode = langData.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toLowerCase()
          if (langCode && langCode.length === 2) {
            detectedLanguage = langCode
            console.log("[v0] Language detected from user input:", detectedLanguage)
          }
        }
      } catch (error) {
        console.log("[v0] Language detection failed, using default:", detectedLanguage)
      }
    }

    const languageInstruction =
      detectedLanguage !== "en"
        ? `\n\nIMPORTANT: The user writes in ${detectedLanguage} language. You MUST respond in ${detectedLanguage} language. All predictions must be written in ${detectedLanguage}.`
        : ""

    const { data: customPromptData } = await supabase
      .from("custom_prompts")
      .select("custom_prompt")
      .eq("user_id", user.id)
      .eq("prompt_type", "timeline_prediction")
      .eq("is_active", true)
      .single()

    let prompt: string

    if (customPromptData?.custom_prompt) {
      // Use custom prompt with variable substitution
      prompt = customPromptData.custom_prompt
        .replace(/\{branchName\}/g, branchName)
        .replace(/\{currentAge\}/g, currentAge.toString())
        .replace(/\{missionText\}/g, mission?.mission_text || "No mission defined")
        .replace(/\{pastEvents\}/g, pastContext)
        .replace(/\{futureEvents\}/g, futureContext)

      console.log("[v0] Using custom prompt for predictions")
    } else {
      // Use default prompt
      prompt = `You are a thoughtful life coach helping someone explore their future possibilities.

Life Path Theme: "${branchName}"
Current Age: ${currentAge}${missionContext}

Recent Past (Last 7 years):
${pastContext}

User's Plans for This Path:
${futureContext}${languageInstruction}

Based on the theme "${branchName}", ${mission?.mission_text ? "their life mission, " : ""}the person's recent past, and their stated plans, generate 3-5 important milestone events that could realistically happen in their future on this life path. 

Requirements:
- Events should be between age ${currentAge} and 100
- Each event should be a single concise sentence (max 15 words)
- Events should align with the theme${mission?.mission_text ? ", mission," : ""} and build upon their past and stated plans
- Be realistic and thoughtful, not overly optimistic or pessimistic
- Spread events across different life stages (don't cluster them)
- IMPORTANT: Do NOT predict events for these years that already have content: ${Array.from(filledYears).join(", ")}
- Consider ALL the user's entered plans when generating predictions - they provide important context about this life path${detectedLanguage !== "en" ? `\n- Write ALL predictions in ${detectedLanguage} language` : ""}

Return ONLY a JSON array of objects with this exact format:
[
  {"year": 35, "event": "Launch successful startup after years of preparation"},
  {"year": 42, "event": "Achieve financial independence milestone"}
]

Do not include any other text, explanations, or markdown formatting.`
    }

    console.log("[v0] Calling Gemini API for branch", branchIndex)
    console.log("[v0] Filled years to avoid:", Array.from(filledYears).join(", "))

    const geminiApiKey = process.env.Gemini_API
    if (!geminiApiKey) {
      console.error("[v0] Gemini API key is missing")
      return NextResponse.json({ error: "Gemini API key not configured" }, { status: 500 })
    }

    // Call Gemini API
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
            temperature: 0.8,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          },
        }),
      },
    )

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text()
      console.error("[v0] Gemini API error response:", errorText)
      console.error("[v0] Gemini API status:", geminiResponse.status)
      return NextResponse.json({ error: `Gemini API failed: ${geminiResponse.status} - ${errorText}` }, { status: 500 })
    }

    const geminiData = await geminiResponse.json()

    if (!geminiData.candidates || !geminiData.candidates[0] || !geminiData.candidates[0].content) {
      console.error("[v0] Invalid Gemini response structure:", JSON.stringify(geminiData))
      return NextResponse.json({ error: "Invalid response from Gemini API" }, { status: 500 })
    }

    const generatedText = geminiData.candidates[0].content.parts[0].text

    console.log("[v0] Gemini generated text:", generatedText.substring(0, 200))

    // Remove markdown code blocks if present
    const cleanedText = generatedText.replace(/```json\n?|\n?```/g, "").trim()
    let predictions: Array<{ year: number; event: string }>
    try {
      predictions = JSON.parse(cleanedText)
    } catch (parseError) {
      console.error("[v0] Failed to parse Gemini response:", generatedText)
      return NextResponse.json({ error: "Failed to parse predictions" }, { status: 500 })
    }

    await supabase
      .from("events")
      .delete()
      .eq("timeline_id", timelineId)
      .eq("branch_index", branchIndex)
      .eq("is_prediction", true)
      .eq("is_user_edited", false)

    const validPredictions = predictions.filter((pred) => !filledYears.has(pred.year))

    console.log("[v0] Generated", predictions.length, "predictions,", validPredictions.length, "are for blank years")

    // Save predictions to database
    const predictionInserts = validPredictions.map((pred) => ({
      timeline_id: timelineId,
      branch_index: branchIndex,
      year: pred.year,
      event_text: pred.event,
      is_prediction: true,
      is_user_edited: false,
    }))

    const { data: insertedPredictions, error: insertError } = await supabase
      .from("events")
      .insert(predictionInserts)
      .select()

    if (insertError) {
      console.error("[v0] Error saving predictions:", insertError)
      return NextResponse.json({ error: "Failed to save predictions" }, { status: 500 })
    }

    console.log("[v0] Successfully generated", insertedPredictions.length, "predictions for branch", branchIndex)

    return NextResponse.json({ predictions: insertedPredictions })
  } catch (error) {
    console.error("[v0] Error generating predictions:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    console.error("[v0] Error details:", errorMessage)
    return NextResponse.json({ error: `Internal server error: ${errorMessage}` }, { status: 500 })
  }
}
