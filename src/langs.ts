/* The languages Placetta talks in. The agent writes and speaks in any of them; menus and pages show in English, or
   in Chinese for the two Chinese options. Saved in this browser. */

export type Speak = { code: string; native: string; en: string };

export const LANGUAGES: Speak[] = [
  { code: "am", native: "አማርኛ", en: "Amharic" },
  { code: "ar", native: "العربية", en: "Arabic" },
  { code: "bn", native: "বাংলা", en: "Bangla" },
  { code: "bho", native: "भोजपुरी", en: "Bhojpuri" },
  { code: "zh-CN", native: "简体中文", en: "Chinese (Simplified)" },
  { code: "zh-TW", native: "繁體中文", en: "Chinese (Traditional)" },
  { code: "da", native: "Dansk", en: "Danish" },
  { code: "nl", native: "Nederlands", en: "Dutch" },
  { code: "en-US", native: "English (United States)", en: "English (United States)" },
  { code: "fil", native: "Filipino", en: "Filipino" },
  { code: "fi", native: "Suomi", en: "Finnish" },
  { code: "fr-FR", native: "Français (France)", en: "French (France)" },
  { code: "de-DE", native: "Deutsch (Deutschland)", en: "German (Germany)" },
  { code: "gu", native: "ગુજરાતી", en: "Gujarati" },
  { code: "ha", native: "Hausa", en: "Hausa" },
  { code: "hi-IN", native: "हिन्दी (भारत)", en: "Hindi (India)" },
  { code: "id-ID", native: "Bahasa Indonesia (Indonesia)", en: "Indonesian (Indonesia)" },
  { code: "it-IT", native: "Italiano (Italia)", en: "Italian (Italy)" },
  { code: "ja-JP", native: "日本語 (日本)", en: "Japanese (Japan)" },
  { code: "kn", native: "ಕನ್ನಡ", en: "Kannada" },
  { code: "ko-KR", native: "한국어 (대한민국)", en: "Korean (South Korea)" },
  { code: "ml", native: "മലയാളം", en: "Malayalam" },
  { code: "mr", native: "मराठी", en: "Marathi" },
  { code: "nb", native: "Norsk bokmål", en: "Norwegian Bokmål" },
  { code: "pt-BR", native: "Português (Brasil)", en: "Portuguese (Brazil)" },
  { code: "ru", native: "Русский", en: "Russian" },
  { code: "es-419", native: "Español (Latinoamérica)", en: "Spanish (Latin America)" },
  { code: "es-ES", native: "Español (España)", en: "Spanish (Spain)" },
  { code: "sw", native: "Kiswahili", en: "Swahili" },
  { code: "sv", native: "Svenska", en: "Swedish" },
  { code: "ta", native: "தமிழ்", en: "Tamil" },
  { code: "te", native: "తెలుగు", en: "Telugu" },
  { code: "th", native: "ไทย", en: "Thai" },
  { code: "tr", native: "Türkçe", en: "Turkish" },
  { code: "vi", native: "Tiếng Việt", en: "Vietnamese" },
];

const KEY = "placetta-speak";
export const speakOf = (code?: string | null) => LANGUAGES.find(l => l.code === code);
/** The language picked in this browser, or null when it simply follows the English/Chinese switch. */
export function readSpeak(): Speak | null {
  try { return speakOf(localStorage.getItem(KEY)) ?? null; } catch { return null; }
}
export function saveSpeak(code: string | null) {
  try { if (code) localStorage.setItem(KEY, code); else localStorage.removeItem(KEY); } catch { /* private mode */ }
}
/** The screens' language for a picked language: Chinese for the Chinese options, English for the rest. */
export const uiLangOf = (code: string): "en" | "zh" => (code.startsWith("zh") ? "zh" : "en");
/** The language the agent writes in, as a name it understands. */
export function replyLanguage(lang: "en" | "zh"): string {
  const s = readSpeak();
  if (s && uiLangOf(s.code) === lang) return s.code === "zh-TW" ? "Traditional Chinese" : s.code === "zh-CN" ? "Simplified Chinese" : s.en;
  return lang === "zh" ? "Simplified Chinese" : "English";
}
/** The BCP 47 tag to speak in. */
export function speakTag(lang: "en" | "zh"): string {
  const s = readSpeak();
  if (s && uiLangOf(s.code) === lang) return s.code === "es-419" ? "es-MX" : s.code;
  return lang === "zh" ? "zh-CN" : "en-US";
}
