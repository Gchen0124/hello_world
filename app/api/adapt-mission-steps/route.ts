import { createClient } from "@/lib/supabase/server"
import { GoogleGenerativeAI } from "@google/generative-ai"

const genAI = new GoogleGenerativeAI(process.env.Gemini_API || "")

export async function POST(request: Request) {
  try {
    const { missionId, editedStepId, editedStepText, allSteps, missionText, metrics, branchName } = await request.json()

    console.log("[v0] Adapting mission steps after edit to step", editedStepId)

    const supabase = await createClient()

    // Find the edited step's position
    const editedStep = allSteps.find((s: any) => s.id === editedStepId)
    if (!editedStep) {
      return Response.json({ error: "Edited step not found" }, { status: 404 })
    }

    const editedStepIndex = allSteps.findIndex((s: any) => s.id === editedStepId)

    // Get steps before and after (excluding user-edited ones)
    const stepsBeforeEdited = allSteps.slice(0, editedStepIndex).filter((s: any) => !s.is_user_edited)
    const stepsAfterEdited = allSteps.slice(editedStepIndex + 1).filter((s: any) => !s.is_user_edited)

    // Build context for Gemini
    const allStepsText = allSteps
      .map((s: any, i: number) => {
        const prefix = s.parent_step_id ? "  - " : `${i + 1}. `
        const marker = s.id === editedStepId ? " [EDITED]" : s.is_user_edited ? " [USER]" : ""
        return `${prefix}${s.step_text}${marker}`
      })
      .join("\n")

    const prompt = `You are a life planning AI assistant. A user just edited a step in their mission plan.

**Context:**
- Branch/Possibility: ${branchName}
- Life Mission: ${missionText}
- Success Metrics: ${metrics.join(", ")}

**Current Steps:**
${allStepsText}

**Recent Edit:**
Step ${editedStepIndex + 1}: "${editedStepText}" [EDITED]

**Task:**
The user edited step ${editedStepIndex + 1}. Analyze how this change affects the overall plan and suggest updates to OTHER steps (both before and after) to maintain coherence and alignment with the mission.

IMPORTANT RULES:
1. DO NOT modify steps marked with [USER] or [EDITED] - these are user-controlled
2. ONLY suggest updates to AI-generated steps (unmarked ones)
3. Focus on steps within 2 positions before and 3 positions after the edited step
4. Ensure the flow makes logical sense: earlier steps should lead to later steps
5. Keep suggestions specific and actionable
6. Consider both main steps and substeps

Return your response as a JSON array of suggested updates:
[
  {
    "stepId": "<step id to update>",
    "newText": "<updated step text>",
    "reason": "<why this update makes sense>"
  }
]

Only include steps that need updates. Return empty array [] if no changes needed.`

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" })
    const result = await model.generateContent(prompt)
    const responseText = result.response.text()

    console.log("[v0] Gemini response:", responseText)

    // Parse JSON from response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      console.log("[v0] No steps to update")
      return Response.json({ suggestions: [], message: "No updates needed" })
    }

    const suggestions = JSON.parse(jsonMatch[0])

    // Update database: update the suggested steps
    if (suggestions.length > 0) {
      for (const suggestion of suggestions) {
        await supabase
          .from("mission_steps")
          .update({
            step_text: suggestion.newText,
            updated_at: new Date().toISOString(),
          })
          .eq("id", suggestion.stepId)
          .eq("mission_id", missionId)
      }

      console.log("[v0] Updated", suggestions.length, "steps")
    }

    // Mark the edited step as user-edited
    await supabase
      .from("mission_steps")
      .update({
        is_user_edited: true,
        last_edited_at: new Date().toISOString(),
      })
      .eq("id", editedStepId)

    return Response.json({
      suggestions,
      message: suggestions.length > 0 ? `Updated ${suggestions.length} related steps` : "No updates needed",
    })
  } catch (error) {
    console.error("[v0] Error adapting steps:", error)
    return Response.json({ error: "Failed to adapt steps" }, { status: 500 })
  }
}
