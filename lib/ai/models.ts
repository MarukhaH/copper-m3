// The course's approved models. Calls go straight to Google with a Google AI
// Studio key, which is free and needs no credit card.
export const MODELS = [
  {
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash (fast, shows its thinking)",
    // Google's own name for it, used when calling Google.
    googleId: "gemini-2.5-flash",
  },
  {
    id: "google/gemini-3-flash",
    label: "Gemini 3 Flash (newer, thinks out loud less often)",
    googleId: "gemini-3-flash-preview",
  },
  {
    id: "google/gemini-3.8-flash",
    label: "Gemini 3.8 Flash (newest, can be slow or busy)",
    googleId: "gemini-3.8-flash",
  },
  {
    id: "google/gemini-3.5-flash-lite",
    label: "Gemini 3.5 Flash-Lite (lighter and quicker, the default)",
    googleId: "gemini-3.5-flash-lite",
  },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];

/**
 * The model used when a call doesn't name one: a light, quick Flash-Lite
 * model. Google closed Gemini 2.5 Flash to new API keys, and 3.8 Flash was
 * timing out. The others are still approved; pick one with AI_MODEL.
 */
export const DEFAULT_MODEL: ModelId = "google/gemini-3.5-flash-lite";

/** AI_MODEL if it names an approved model, otherwise the default. */
export function defaultModel(): ModelId {
  const id = process.env.AI_MODEL;
  return MODELS.find((m) => m.id === id)?.id ?? DEFAULT_MODEL;
}
