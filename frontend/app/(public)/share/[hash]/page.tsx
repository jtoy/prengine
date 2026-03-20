"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams } from "next/navigation"

interface Scene {
  id: number
  scene_number: number
  title: string | null
  description: string | null
  sketch_url: string | null
  notes: string | null
}

interface SharedPlan {
  id: number
  title: string
  description: string | null
  share_hash: string
  created_at: string
  scenes: Scene[]
}

export default function SharedPlanSlideshow() {
  const params = useParams()
  const hash = params.hash as string

  const [plan, setPlan] = useState<SharedPlan | null>(null)
  const [currentSlide, setCurrentSlide] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchPlan() {
      try {
        const res = await fetch(`/api/director/plans/share/${hash}`)
        if (!res.ok) {
          const data = await res.json()
          setError(data.error || "Plan not found")
          return
        }
        const data = await res.json()
        setPlan(data)
      } catch {
        setError("Failed to load plan")
      } finally {
        setLoading(false)
      }
    }
    if (hash) fetchPlan()
  }, [hash])

  const totalSlides = plan?.scenes.length ?? 0

  const goNext = useCallback(() => {
    setCurrentSlide((prev) => Math.min(prev + 1, totalSlides - 1))
  }, [totalSlides])

  const goPrev = useCallback(() => {
    setCurrentSlide((prev) => Math.max(prev - 1, 0))
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        goNext()
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        goPrev()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [goNext, goPrev])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
        <p className="text-lg">Loading...</p>
      </div>
    )
  }

  if (error || !plan) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
        <p className="text-lg text-red-400">{error || "Plan not found"}</p>
      </div>
    )
  }

  const scene = plan.scenes[currentSlide]

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 border-b border-gray-800">
        <h1 className="text-xl font-bold">{plan.title}</h1>
        {plan.description && (
          <p className="text-sm text-gray-400 mt-1">{plan.description}</p>
        )}
      </header>

      {/* Slide content */}
      <main className="flex-1 flex items-center justify-center px-6 py-8">
        <div className="w-full max-w-4xl">
          {scene && (
            <div className="space-y-6">
              {/* Scene heading */}
              <div className="text-center">
                <span className="text-sm text-gray-500 uppercase tracking-wider">
                  Scene {scene.scene_number} of {totalSlides}
                </span>
                {scene.title && (
                  <h2 className="text-2xl font-semibold mt-2">{scene.title}</h2>
                )}
              </div>

              {/* Main sketch */}
              {scene.sketch_url && (
                <div className="flex justify-center">
                  <img
                    src={scene.sketch_url}
                    alt={scene.title || `Scene ${scene.scene_number}`}
                    className="max-w-full max-h-[50vh] rounded-lg border border-gray-800 object-contain"
                  />
                </div>
              )}

              {/* Description */}
              {scene.description && (
                <div className="bg-gray-900 rounded-lg p-4">
                  <p className="text-gray-300 whitespace-pre-wrap">
                    {scene.description}
                  </p>
                </div>
              )}

              {/* Notes */}
              {scene.notes && (
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-800">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                    Notes
                  </p>
                  <p className="text-gray-400 text-sm whitespace-pre-wrap">
                    {scene.notes}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Navigation arrows */}
      <footer className="px-6 py-4 border-t border-gray-800 flex items-center justify-between">
        <button
          onClick={goPrev}
          disabled={currentSlide === 0}
          className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Previous scene"
        >
          ← Previous
        </button>

        <div className="flex items-center gap-2">
          {plan.scenes.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentSlide(i)}
              className={`w-2.5 h-2.5 rounded-full transition-colors ${
                i === currentSlide
                  ? "bg-white"
                  : "bg-gray-600 hover:bg-gray-500"
              }`}
              aria-label={`Go to scene ${i + 1}`}
            />
          ))}
        </div>

        <button
          onClick={goNext}
          disabled={currentSlide === totalSlides - 1}
          className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Next scene"
        >
          Next →
        </button>
      </footer>
    </div>
  )
}
