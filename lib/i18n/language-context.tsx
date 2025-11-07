"use client"

import type React from "react"
import { createContext, useContext, useState, useEffect } from "react"
import type { LanguageCode } from "./languages"
import { DEFAULT_LANGUAGE } from "./languages"

type LanguageContextType = {
  language: LanguageCode
  setLanguage: (lang: LanguageCode) => void
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(DEFAULT_LANGUAGE)

  useEffect(() => {
    const saved = localStorage.getItem("preferred_language") as LanguageCode
    if (saved) {
      setLanguageState(saved)
    }
  }, [])

  const setLanguage = (lang: LanguageCode) => {
    setLanguageState(lang)
    localStorage.setItem("preferred_language", lang)
  }

  return <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider")
  }
  return context
}
