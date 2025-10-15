import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    console.log("[v0] Generate mission steps API called")

    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error("[v0] Auth error:", authError)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { missionId, missionText, metrics, branchName } = body

    console.log("[v0] Request body:", { missionId, missionText: missionText?.substring(0, 50), metrics, branchName })

    // Verify mission belongs to user
    const { data: mission, error: missionError } = await supabase
      .from("life_missions")
      .select("*, timelines!inner(user_id)")
      .eq("id", missionId)
      .single()

    if (missionError || !mission || mission.timelines.user_id !== user.id) {
      console.error("[v0] Mission verification failed:", missionError)
      return NextResponse.json({ error: "Mission not found" }, { status: 404 })
    }

    const metricsContext = metrics && metrics.length > 0 ? metrics.join("\n- ") : "No specific metrics defined"

    const prompt = `You are a strategic life planning expert helping someone break down their ultimate life mission into actionable steps.

Life Path: "${branchName}"
Ultimate Life Mission: "${missionText}"

Success Metrics:
- ${metricsContext}

Create a comprehensive, hierarchical breakdown of key steps needed to achieve this mission. Include:
- Major milestones (top-level steps)
- Sub-steps for each milestone (nested steps)
- Be specific and actionable
- Consider short-term, medium-term, and long-term actions
- Align with the success metrics provided

Return ONLY a JSON array with this exact structure:
[
  {
    "step": "Build foundational skills and knowledge",
    "substeps": [
      "Complete relevant education or certifications",
      "Gain practical experience through projects",
      "Build network in the field"
    ]
  },
  {
    "step": "Establish initial presence and credibility",
    "substeps": [
      "Create portfolio of work",
      "Share knowledge through content",
      "Seek mentorship from experts"
    ]
  }
]

Generate 5-8 major steps with 2-5 substeps each. Be thoughtful and realistic.
Do not include any other text, explanations, or markdown formatting.`

    console.log("[v0] Calling Gemini API...")

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
      const errorText = await geminiResponse.text()
      console.error("[v0] Gemini API error:", errorText)
      throw new Error("Gemini API request failed")
    }

    const geminiData = await geminiResponse.json()
    const generatedText = geminiData.candidates[0].content.parts[0].text

    console.log("[v0] Gemini response:", generatedText.substring(0, 200))

    let stepsData: Array<{ step: string; substeps: string[] }>
    try {
      const cleanedText = generatedText.replace(/```json\n?|\n?```/g, "").trim()
      stepsData = JSON.parse(cleanedText)
      console.log("[v0] Parsed steps data:", stepsData.length, "steps")
    } catch (parseError) {
      console.error("[v0] Failed to parse Gemini response:", generatedText)
      return NextResponse.json({ error: "Failed to parse steps" }, { status: 500 })
    }

    console.log("[v0] Deleting existing AI-generated steps for mission", missionId)
    await supabase
      .from("mission_steps")
      .delete()
      .eq("mission_id", missionId)
      .eq("is_ai_generated", true)
      .eq("is_user_edited", false) // Don't delete user-edited AI steps

    // Insert new steps with hierarchy
    console.log("[v0] Inserting new steps...")
    const insertedSteps = []
    for (let i = 0; i < stepsData.length; i++) {
      const stepData = stepsData[i]

      // Insert parent step
      const { data: parentStep, error: parentError } = await supabase
        .from("mission_steps")
        .insert({
          mission_id: missionId,
          step_text: stepData.step,
          display_order: i,
          is_ai_generated: true,
          is_user_edited: false, // Explicitly set as not user-edited
        })
        .select()
        .single()

      if (parentError) {
        console.error("[v0] Error inserting parent step:", parentError)
        continue
      }

      insertedSteps.push(parentStep)

      // Insert substeps
      if (stepData.substeps && stepData.substeps.length > 0) {
        for (let j = 0; j < stepData.substeps.length; j++) {
          const { data: subStep, error: subError } = await supabase
            .from("mission_steps")
            .insert({
              mission_id: missionId,
              parent_step_id: parentStep.id,
              step_text: stepData.substeps[j],
              display_order: j,
              is_ai_generated: true,
              is_user_edited: false, // Explicitly set as not user-edited
            })
            .select()
            .single()

          if (!subError && subStep) {
            insertedSteps.push(subStep)
          }
        }
      }
    }

    console.log("[v0] Successfully inserted", insertedSteps.length, "steps")
    return NextResponse.json({ steps: insertedSteps })
  } catch (error) {
    console.error("[v0] Error generating mission steps:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
