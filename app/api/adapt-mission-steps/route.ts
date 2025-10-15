import { createClient } from "@/lib/supabase/server"
import { GoogleGenerativeAI } from "@google/generative-ai"

const genAI = new GoogleGenerativeAI(process.env.Gemini_API || "")

export async function POST(request: Request) {
  try {
    const { missionId, editedStepId, editedStepText, allSteps, missionText, metrics, branchName } = await request.json()

    console.log("[v0] Adapting mission steps after edit to step", editedStepId)

    const supabase = await createClient()

    const { data: currentSteps } = await supabase
      .from("mission_steps")
      .select("*")
      .eq("mission_id", missionId)
      .order("display_order")

    if (!currentSteps) {
      return Response.json({ error: "Could not fetch current steps" }, { status: 404 })
    }

    // Find the edited step's position
    const editedStep = currentSteps.find((s: any) => s.id === editedStepId)
    if (!editedStep) {
      return Response.json({ error: "Edited step not found" }, { status: 404 })
    }

    const editedStepIndex = currentSteps.findIndex((s: any) => s.id === editedStepId)

    const adaptableSteps = currentSteps.filter(
      (s: any) => s.id !== editedStepId && s.is_ai_generated && !s.is_user_edited,
    )

    if (adaptableSteps.length === 0) {
      console.log("[v0] No adaptable steps found")
      return Response.json({ suggestions: [], message: "No AI-generated steps to adapt" })
    }

    // Build context for Gemini
    const allStepsText = currentSteps
      .map((s: any, i: number) => {
        const prefix = s.parent_step_id ? "  - " : `${i + 1}. `
        const marker = s.id === editedStepId ? " [JUST EDITED]" : s.is_user_edited ? " [USER EDITED]" : " [AI]"
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
Step ${editedStepIndex + 1}: "${editedStepText}" [JUST EDITED]

**Task:**
The user edited step ${editedStepIndex + 1}. Analyze how this change affects the overall plan and suggest updates to OTHER AI-generated steps (marked with [AI]) to maintain coherence.

CRITICAL RULES:
1. ONLY modify steps marked with [AI] - these are AI-generated and not user-edited
2. NEVER modify steps marked with [USER EDITED] or [JUST EDITED]
3. Focus on steps within 2-3 positions before and after the edited step
4. Ensure logical flow: earlier steps should lead to later steps
5. Keep suggestions specific and actionable
6. If a step no longer makes sense after the edit, suggest removing it (return empty string for newText)

Return your response as a JSON array:
[
  {
    "stepId": "<step id from the list above>",
    "newText": "<updated step text, or empty string to remove>",
    "reason": "<brief explanation>"
  }
]

Only include steps that need updates. Return empty array [] if no changes needed.`

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" })
    const result = await model.generateContent(prompt)
    const responseText = result.response.text()

    console.log("[v0] Gemini response:", responseText.substring(0, 300))

    // Parse JSON from response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      console.log("[v0] No steps to update")
      return Response.json({ suggestions: [], message: "No updates needed" })
    }

    const suggestions = JSON.parse(jsonMatch[0])

    if (suggestions.length > 0) {
      for (const suggestion of suggestions) {
        if (suggestion.newText === "") {
          // Delete the step
          await supabase.from("mission_steps").delete().eq("id", suggestion.stepId).eq("mission_id", missionId)
          console.log("[v0] Deleted step", suggestion.stepId)
        } else {
          // Update the step
          await supabase
            .from("mission_steps")
            .update({
              step_text: suggestion.newText,
              updated_at: new Date().toISOString(),
            })
            .eq("id", suggestion.stepId)
            .eq("mission_id", missionId)
          console.log("[v0] Updated step", suggestion.stepId)
        }
      }

      console.log("[v0] Processed", suggestions.length, "step adaptations")
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
      message: suggestions.length > 0 ? `Adapted ${suggestions.length} related steps` : "No updates needed",
    })
  } catch (error) {
    console.error("[v0] Error adapting steps:", error)
    return Response.json({ error: "Failed to adapt steps" }, { status: 500 })
  }
}
