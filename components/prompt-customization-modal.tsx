"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { X, Sparkles, RotateCcw } from "lucide-react"
import { useLanguage } from "@/lib/i18n/language-context"

interface PromptCustomizationModalProps {
  isOpen: boolean
  onClose: () => void
}

const DEFAULT_PROMPTS = {
  timeline_prediction: `You are a thoughtful life coach helping someone explore their future possibilities.

Based on the theme "{branchName}", the person's life mission, recent past, and their stated plans, generate 3-5 important milestone events that could realistically happen in their future.

Requirements:
- Events should be between current age and 100
- Each event should be concise (max 15 words)
- Events should align with the theme, mission, and build upon past and stated plans
- Be realistic and thoughtful
- Spread events across different life stages
- Avoid years that already have content`,

  mission_steps: `You are a strategic life planning expert helping someone break down their ultimate life mission into actionable steps.

Create a comprehensive, hierarchical breakdown of key steps needed to achieve this mission. Include:
- Major milestones (top-level steps)
- Sub-steps for each milestone (nested steps)
- Be specific and actionable
- Consider short-term, medium-term, and long-term actions
- Align with the success metrics provided

Generate 5-8 major steps with 2-5 substeps each.`,

  timeline_adaptation: `You are a life planning AI assistant analyzing how a user's edit affects their future timeline.

Based on the user's recent edit, analyze how this change affects the timeline and suggest updated predictions for years BEFORE and AFTER this event.

IMPORTANT RULES:
- DO NOT modify user-entered events
- ONLY suggest updates to AI-generated predictions
- Focus on years within 3 years before and 5 years after the edited event
- Ensure predictions align with mission and new context
- Keep predictions realistic and specific (max 15 words each)`,

  steps_adaptation: `You are a life planning AI assistant. A user just edited a step in their mission plan.

Analyze how this change affects the overall plan and suggest updates to OTHER AI-generated steps to maintain coherence.

CRITICAL RULES:
- ONLY modify AI-generated steps (not user-edited)
- Focus on steps within 2-3 positions before and after the edited step
- Ensure logical flow: earlier steps should lead to later steps
- Keep suggestions specific and actionable`,
}

export function PromptCustomizationModal({ isOpen, onClose }: PromptCustomizationModalProps) {
  const { t } = useLanguage()
  const [activeTab, setActiveTab] = useState<keyof typeof DEFAULT_PROMPTS>("timeline_prediction")
  const [prompts, setPrompts] = useState(DEFAULT_PROMPTS)
  const [customPrompts, setCustomPrompts] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    if (isOpen) {
      loadCustomPrompts()
    }
  }, [isOpen])

  const loadCustomPrompts = async () => {
    const { data } = await supabase.from("custom_prompts").select("prompt_type, custom_prompt").eq("is_active", true)

    if (data) {
      const loaded: Record<string, string> = {}
      data.forEach((p) => {
        loaded[p.prompt_type] = p.custom_prompt
      })
      setCustomPrompts(loaded)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const promptToSave = customPrompts[activeTab] || prompts[activeTab]

      await supabase.from("custom_prompts").upsert({
        prompt_type: activeTab,
        custom_prompt: promptToSave,
        is_active: true,
      })

      alert(t("promptSaved"))
    } catch (error) {
      console.error("Error saving prompt:", error)
      alert(t("promptSaveError"))
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = async () => {
    if (confirm(t("confirmResetPrompt"))) {
      await supabase.from("custom_prompts").delete().eq("prompt_type", activeTab)

      const newCustom = { ...customPrompts }
      delete newCustom[activeTab]
      setCustomPrompts(newCustom)
    }
  }

  const currentPrompt = customPrompts[activeTab] || prompts[activeTab]
  const isCustomized = !!customPrompts[activeTab]

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-gradient-to-br from-slate-900/95 to-slate-950/95 backdrop-blur-xl border border-cyan-500/20 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-cyan-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-cyan-500/20 to-purple-500/20 rounded-lg">
              <Sparkles className="h-5 w-5 text-cyan-400" />
            </div>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
              {t("customizeAIPrompts")}
            </h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-slate-400 hover:text-white hover:bg-slate-800/50"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 p-4 overflow-x-auto border-b border-cyan-500/10">
          {Object.keys(DEFAULT_PROMPTS).map((type) => (
            <button
              key={type}
              onClick={() => setActiveTab(type as keyof typeof DEFAULT_PROMPTS)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === type
                  ? "bg-gradient-to-r from-cyan-500/20 to-purple-500/20 text-white border border-cyan-500/30"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/30"
              }`}
            >
              {t(type as any)}
              {customPrompts[type] && (
                <span className="ml-2 inline-block w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto" style={{ maxHeight: "calc(90vh - 200px)" }}>
          <div className="mb-4">
            <p className="text-sm text-slate-400 mb-2">{t("promptDescription")}</p>
            {isCustomized && (
              <div className="flex items-center gap-2 text-xs text-cyan-400 bg-cyan-500/10 px-3 py-2 rounded-lg">
                <Sparkles className="h-4 w-4" />
                <span>{t("usingCustomPrompt")}</span>
              </div>
            )}
          </div>

          <Textarea
            value={currentPrompt}
            onChange={(e) => setCustomPrompts({ ...customPrompts, [activeTab]: e.target.value })}
            className="min-h-[300px] bg-slate-950/50 border-cyan-500/20 text-slate-100 font-mono text-sm"
            placeholder={t("enterCustomPrompt")}
          />

          <div className="mt-4 p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-lg">
            <h4 className="text-sm font-semibold text-cyan-400 mb-2">{t("availableVariables")}</h4>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
              <code className="bg-slate-900/50 px-2 py-1 rounded">{"{{branchName}}"}</code>
              <code className="bg-slate-900/50 px-2 py-1 rounded">{"{{missionText}}"}</code>
              <code className="bg-slate-900/50 px-2 py-1 rounded">{"{{currentAge}}"}</code>
              <code className="bg-slate-900/50 px-2 py-1 rounded">{"{{pastEvents}}"}</code>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-cyan-500/20 bg-slate-950/50">
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={!isCustomized || isSaving}
            className="border-slate-700 text-slate-400 hover:bg-slate-800/50 bg-transparent"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            {t("resetToDefault")}
          </Button>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              className="border-slate-700 text-slate-400 hover:bg-slate-800/50 bg-transparent"
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-gradient-to-r from-cyan-500 to-purple-500 text-white hover:from-cyan-600 hover:to-purple-600"
            >
              {isSaving ? t("saving") : t("savePrompt")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
