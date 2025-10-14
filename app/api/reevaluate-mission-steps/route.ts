import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { missionId, editedStepId, editedStepText, allSteps, missionText, metrics, branchName } = body

    // Verify mission belongs to user
    const { data: mission, error: missionError } = await supabase
      .from("life_missions")
      .select("*, timelines!inner(user_id)")
      .eq("id", missionId)
      .single()

    if (missionError || !mission || mission.timelines.user_id !== user.id) {
      return NextResponse.json({ error: "Mission not found" }, { status: 404 })
    }

    const metricsContext = metrics && metrics.length > 0 ? metrics.join("\n- ") : "No specific metrics defined"

    const stepsContext = allSteps
      .map((s: any) => {
        if (s.id === editedStepId) {
          return `- ${editedStepText} [EDITED BY USER]`
        }
        return `- ${s.step_text}`
      })
      .join("\n")

    const prompt = `You are a strategic life planning expert. A user has edited one of their mission steps, and you need to re-evaluate and adapt the other steps to maintain coherence.

Life Path: "${branchName}"
Ultimate Life Mission: "${missionText}"

Success Metrics:
- ${metricsContext}

Current Steps (one was just edited by user):
${stepsContext}

The user edited a step to: "${editedStepText}"

Based on this change, suggest adaptations to OTHER steps (not the edited one) to maintain a coherent, logical progression toward the mission. Consider:
- Does the edited step change priorities?
- Should other steps be reordered?
- Do other steps need to be modified to align with this change?
- Are there new steps needed?

Return ONLY a JSON array of suggested changes with this format:
[
  {
    "stepId": "uuid-of-step-to-modify",
    "suggestedText": "Updated step text that aligns with the user's edit",
    "reason": "Brief explanation of why this change makes sense"
  }
]

If no changes are needed, return an empty array [].
Do not include any other text, explanations, or markdown formatting.`

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
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
          },
        }),
      },
    )

    if (!geminiResponse.ok) {
      throw new Error("Gemini API request failed")
    }

    const geminiData = await geminiResponse.json()
    const generatedText = geminiData.candidates[0].content.parts[0].text

    let suggestions: Array<{ stepId: string; suggestedText: string; reason: string }>
    try {
      const cleanedText = generatedText.replace(/```json\n?|\n?```/g, "").trim()
      suggestions = JSON.parse(cleanedText)
    } catch (parseError) {
      console.error("[v0] Failed to parse Gemini response:", generatedText)
      return NextResponse.json({ suggestions: [] })
    }

    return NextResponse.json({ suggestions })
  } catch (error) {
    console.error("[v0] Error re-evaluating steps:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
