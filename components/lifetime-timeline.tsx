"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/client"
import { Loader2, Sparkles, X } from "lucide-react"

type EventData = {
  [year: number]: string
}

type BranchEvents = {
  [branchIndex: number]: EventData
}

type BranchNames = {
  [branchIndex: number]: string
}

type Prediction = {
  id: string
  year: number
  event_text: string
}

type BranchPredictions = {
  [branchIndex: number]: Prediction[]
}

const BRANCH_COLORS = ["border-chart-1", "border-chart-2", "border-chart-3", "border-chart-4", "border-chart-5"]
const BRANCH_BG_COLORS = ["bg-chart-1/10", "bg-chart-2/10", "bg-chart-3/10", "bg-chart-4/10", "bg-chart-5/10"]
const BRANCH_TEXT_COLORS = ["text-chart-1", "text-chart-2", "text-chart-3", "text-chart-4", "text-chart-5"]
const DEFAULT_BRANCH_NAMES = ["Possibility A", "Possibility B", "Possibility C", "Possibility D", "Possibility E"]

export default function LifetimeTimeline({ userId }: { userId: string }) {
  const [currentAge, setCurrentAge] = useState<number | null>(null)
  const [ageInput, setAgeInput] = useState("")
  const [pastEvents, setPastEvents] = useState<EventData>({})
  const [futureEvents, setFutureEvents] = useState<BranchEvents>({
    0: {},
    1: {},
    2: {},
    3: {},
    4: {},
  })
  const [branchNames, setBranchNames] = useState<BranchNames>({
    0: DEFAULT_BRANCH_NAMES[0],
    1: DEFAULT_BRANCH_NAMES[1],
    2: DEFAULT_BRANCH_NAMES[2],
    3: DEFAULT_BRANCH_NAMES[3],
    4: DEFAULT_BRANCH_NAMES[4],
  })
  const [predictions, setPredictions] = useState<BranchPredictions>({
    0: [],
    1: [],
    2: [],
    3: [],
    4: [],
  })
  const [generatingBranch, setGeneratingBranch] = useState<number | null>(null)
  const [timelineId, setTimelineId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    loadTimelineData()
  }, [userId])

  const loadTimelineData = async () => {
    try {
      setIsLoading(true)

      const { data: timelines, error: timelineError } = await supabase
        .from("timelines")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)

      if (timelineError) throw timelineError

      if (timelines && timelines.length > 0) {
        const timeline = timelines[0]
        setTimelineId(timeline.id)
        setCurrentAge(timeline.current_age)

        const { data: branches, error: branchError } = await supabase
          .from("possibility_branches")
          .select("*")
          .eq("timeline_id", timeline.id)

        if (branchError) throw branchError

        if (branches && branches.length > 0) {
          const loadedBranchNames: BranchNames = {}
          branches.forEach((branch) => {
            loadedBranchNames[branch.branch_index] = branch.branch_name
          })
          setBranchNames(loadedBranchNames)
        }

        const { data: events, error: eventsError } = await supabase
          .from("events")
          .select("*")
          .eq("timeline_id", timeline.id)

        if (eventsError) throw eventsError

        if (events && events.length > 0) {
          const loadedPastEvents: EventData = {}
          const loadedFutureEvents: BranchEvents = { 0: {}, 1: {}, 2: {}, 3: {}, 4: {} }
          const loadedPredictions: BranchPredictions = { 0: [], 1: [], 2: [], 3: [], 4: [] }

          events.forEach((event) => {
            if (event.is_prediction && event.branch_index !== null) {
              loadedPredictions[event.branch_index].push({
                id: event.id,
                year: event.year,
                event_text: event.event_text,
              })
            } else if (event.branch_index === null) {
              loadedPastEvents[event.year] = event.event_text
            } else {
              loadedFutureEvents[event.branch_index][event.year] = event.event_text
            }
          })

          setPastEvents(loadedPastEvents)
          setFutureEvents(loadedFutureEvents)
          setPredictions(loadedPredictions)
        }
      }
    } catch (error) {
      console.error("[v0] Error loading timeline:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const saveTimelineData = async () => {
    if (!currentAge || !timelineId) return

    try {
      setIsSaving(true)

      await supabase
        .from("timelines")
        .update({ current_age: currentAge, updated_at: new Date().toISOString() })
        .eq("id", timelineId)

      for (let i = 0; i < 5; i++) {
        await supabase.from("possibility_branches").upsert(
          {
            timeline_id: timelineId,
            branch_index: i,
            branch_name: branchNames[i],
          },
          { onConflict: "timeline_id,branch_index" },
        )
      }

      await supabase.from("events").delete().eq("timeline_id", timelineId).eq("is_prediction", false)

      const pastEventsToInsert = Object.entries(pastEvents)
        .filter(([_, text]) => text.trim() !== "")
        .map(([year, text]) => ({
          timeline_id: timelineId,
          branch_index: null,
          year: Number.parseInt(year),
          event_text: text,
          is_prediction: false,
        }))

      const futureEventsToInsert = Object.entries(futureEvents).flatMap(([branchIndex, events]) =>
        Object.entries(events)
          .filter(([_, text]) => text.trim() !== "")
          .map(([year, text]) => ({
            timeline_id: timelineId,
            branch_index: Number.parseInt(branchIndex),
            year: Number.parseInt(year),
            event_text: text,
            is_prediction: false,
          })),
      )

      const allEvents = [...pastEventsToInsert, ...futureEventsToInsert]

      if (allEvents.length > 0) {
        await supabase.from("events").insert(allEvents)
      }

      console.log("[v0] Timeline saved successfully")
    } catch (error) {
      console.error("[v0] Error saving timeline:", error)
    } finally {
      setIsSaving(false)
    }
  }

  const generatePredictions = async (branchIndex: number) => {
    if (!timelineId || !currentAge) return

    try {
      setGeneratingBranch(branchIndex)

      // Delete existing predictions for this branch
      await supabase
        .from("events")
        .delete()
        .eq("timeline_id", timelineId)
        .eq("branch_index", branchIndex)
        .eq("is_prediction", true)

      const response = await fetch("/api/generate-predictions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          timelineId,
          branchIndex,
          branchName: branchNames[branchIndex],
          currentAge,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to generate predictions")
      }

      const data = await response.json()

      // Update predictions state
      setPredictions((prev) => ({
        ...prev,
        [branchIndex]: data.predictions.map((p: any) => ({
          id: p.id,
          year: p.year,
          event_text: p.event_text,
        })),
      }))
    } catch (error) {
      console.error("[v0] Error generating predictions:", error)
    } finally {
      setGeneratingBranch(null)
    }
  }

  const deletePrediction = async (predictionId: string, branchIndex: number) => {
    try {
      await supabase.from("events").delete().eq("id", predictionId)

      setPredictions((prev) => ({
        ...prev,
        [branchIndex]: prev[branchIndex].filter((p) => p.id !== predictionId),
      }))
    } catch (error) {
      console.error("[v0] Error deleting prediction:", error)
    }
  }

  const handleAgeSubmit = async () => {
    const age = Number.parseInt(ageInput)
    if (age >= 0 && age <= 100) {
      setCurrentAge(age)

      try {
        const { data, error } = await supabase
          .from("timelines")
          .insert({
            user_id: userId,
            current_age: age,
          })
          .select()
          .single()

        if (error) throw error

        setTimelineId(data.id)

        const branchInserts = DEFAULT_BRANCH_NAMES.map((name, index) => ({
          timeline_id: data.id,
          branch_index: index,
          branch_name: name,
        }))

        await supabase.from("possibility_branches").insert(branchInserts)
      } catch (error) {
        console.error("[v0] Error creating timeline:", error)
      }
    }
  }

  const updatePastEvent = (year: number, event: string) => {
    setPastEvents((prev) => ({ ...prev, [year]: event }))
  }

  const updateFutureEvent = (branch: number, year: number, event: string) => {
    setFutureEvents((prev) => ({
      ...prev,
      [branch]: { ...prev[branch], [year]: event },
    }))
  }

  const updateBranchName = (branchIndex: number, name: string) => {
    setBranchNames((prev) => ({ ...prev, [branchIndex]: name }))
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (currentAge === null) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md p-8">
          <h1 className="mb-6 text-center font-serif text-3xl text-balance">{"Your Lifetime Timeline"}</h1>
          <p className="mb-6 text-center text-muted-foreground text-pretty">
            {"Enter your current age to begin mapping your life journey and exploring future possibilities."}
          </p>
          <div className="flex gap-3">
            <Input
              type="number"
              min="0"
              max="100"
              placeholder="Enter your age (0-100)"
              value={ageInput}
              onChange={(e) => setAgeInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAgeSubmit()}
              className="flex-1"
            />
            <Button onClick={handleAgeSubmit}>{"Start"}</Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl p-4 py-12 md:p-8">
      <div className="mb-12 text-center">
        <h1 className="mb-3 font-serif text-4xl text-balance md:text-5xl">{"Your Lifetime Timeline"}</h1>
        <p className="text-lg text-muted-foreground">
          {"Current Age: "}
          <span className="font-semibold text-foreground">{currentAge}</span>
        </p>
        <div className="mt-4 flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setCurrentAge(null)}>
            {"Change Age"}
          </Button>
          <Button size="sm" onClick={saveTimelineData} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {"Saving..."}
              </>
            ) : (
              "Save Timeline"
            )}
          </Button>
        </div>
      </div>

      <div className="relative">
        <div className="mb-8 flex justify-center">
          <div className="relative w-full max-w-md">
            <h2 className="mb-4 text-center font-serif text-2xl text-muted-foreground">{"The Past"}</h2>
            <div className="relative border-l-2 border-primary pl-8">
              {Array.from({ length: currentAge }, (_, i) => i).map((year) => (
                <div key={`past-${year}`} className="relative mb-1">
                  <div className="absolute -left-[37px] top-1 h-3 w-3 rounded-full border-2 border-primary bg-background" />
                  <div className="flex items-center gap-3">
                    <span className="min-w-[50px] font-mono text-sm text-muted-foreground">{`Y${year}`}</span>
                    <input
                      type="text"
                      placeholder="event"
                      value={pastEvents[year] || ""}
                      onChange={(e) => updatePastEvent(year, e.target.value)}
                      className="flex-1 border-b border-border bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-muted-foreground/50 focus:border-primary"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="my-8 flex items-center gap-4">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary to-transparent" />
          <div className="rounded-full bg-primary px-6 py-2 font-semibold text-primary-foreground">
            {`Y${currentAge} - NOW`}
          </div>
          <div className="h-px flex-1 bg-gradient-to-r from-primary via-primary to-transparent" />
        </div>

        <div className="mt-8">
          <h2 className="mb-6 text-center font-serif text-2xl text-muted-foreground">{"Future Possibilities"}</h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {[0, 1, 2, 3, 4].map((branchIndex) => (
              <div key={`branch-${branchIndex}`} className="relative">
                <div
                  className={`sticky top-4 z-10 mb-3 rounded-lg ${BRANCH_BG_COLORS[branchIndex]} border-2 ${BRANCH_COLORS[branchIndex]} px-3 py-1.5`}
                >
                  <input
                    type="text"
                    value={branchNames[branchIndex]}
                    onChange={(e) => updateBranchName(branchIndex, e.target.value)}
                    className="w-full bg-transparent text-center text-sm font-semibold outline-none"
                    placeholder={`Possibility ${String.fromCharCode(65 + branchIndex)}`}
                  />
                </div>
                <div className="mb-3 flex justify-center">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => generatePredictions(branchIndex)}
                    disabled={generatingBranch !== null}
                    className="text-xs"
                  >
                    {generatingBranch === branchIndex ? (
                      <>
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        {"Predicting..."}
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-1 h-3 w-3" />
                        {"AI Predict"}
                      </>
                    )}
                  </Button>
                </div>
                <div className={`relative border-l-2 ${BRANCH_COLORS[branchIndex]} pl-6`}>
                  {Array.from({ length: 100 - currentAge + 1 }, (_, i) => currentAge + i).map((year) => {
                    const prediction = predictions[branchIndex].find((p) => p.year === year)

                    return (
                      <div key={`branch-${branchIndex}-year-${year}`} className="relative mb-1">
                        <div
                          className={`absolute -left-[25px] top-1 h-2 w-2 rounded-full border-2 ${BRANCH_COLORS[branchIndex]} bg-background`}
                        />
                        <div className="flex items-center gap-2">
                          <span className="min-w-[45px] font-mono text-xs text-muted-foreground">{`Y${year}`}</span>
                          {prediction ? (
                            <div className="group relative flex flex-1 items-center gap-1">
                              <div
                                className={`flex-1 animate-pulse rounded border ${BRANCH_COLORS[branchIndex]} ${BRANCH_BG_COLORS[branchIndex]} px-2 py-1 text-xs italic ${BRANCH_TEXT_COLORS[branchIndex]}`}
                              >
                                {prediction.event_text}
                              </div>
                              <button
                                onClick={() => deletePrediction(prediction.id, branchIndex)}
                                className="opacity-0 transition-opacity group-hover:opacity-100"
                                title="Delete prediction"
                              >
                                <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                              </button>
                            </div>
                          ) : (
                            <input
                              type="text"
                              placeholder="event"
                              value={futureEvents[branchIndex][year] || ""}
                              onChange={(e) => updateFutureEvent(branchIndex, year, e.target.value)}
                              className="flex-1 border-b border-border bg-transparent px-1 py-0.5 text-xs outline-none placeholder:text-muted-foreground/50 focus:border-primary"
                            />
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
