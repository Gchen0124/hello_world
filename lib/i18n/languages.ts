export const SUPPORTED_LANGUAGES = {
  en: "English",
  es: "Español",
  zh: "中文",
  fr: "Français",
  de: "Deutsch",
  ja: "日本語",
  ko: "한국어",
  pt: "Português",
  ar: "العربية",
  ru: "Русский",
} as const

export type LanguageCode = keyof typeof SUPPORTED_LANGUAGES

export const DEFAULT_LANGUAGE: LanguageCode = "en"
