// Turns a client's free-text preferences into structured Preferences.
//
// - With GROQ_API_KEY: ask an LLM (OpenAI-compatible API) for JSON.
// - Without a key, or if the call fails: deterministic rule-based fallback.
// Both paths go through sanitizePreferences() (valid shape) and then
// keepOnlyGrounded() (every value must have evidence in the client's words),
// so nothing is invented or carried over from a previous client.

import { CITY_ALIASES, normalizeCity } from "./matchEngine.js";
import {
  EDUCATION_LEVELS,
  HEIGHTS,
  RELATIONSHIP_INTENTS,
  type Education,
  type Height,
  type PreferenceKey,
  type Preferences,
  type RelationshipIntent,
} from "./types.js";

export interface ExtractionResult {
  preferences: Preferences;
  source: "ai" | "fallback";
  model?: string;
  responseFormat?: "json_schema" | "json_object"; // how Groq was asked for JSON
  aiError?: string; // why AI wasn't used (safe to show in the UI)
  warning?: string; // e.g. values removed by the grounding guard
}

const PREFERENCE_KEYS: PreferenceKey[] = ["age", "height", "location", "smoking", "wantsChildren", "education", "relationshipIntent"];

// ---------- Validation (shared by both paths) ----------

const toBool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

function toAge(v: unknown): number | null {
  const n = typeof v === "string" ? parseInt(v, 10) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 18 && n <= 99 ? Math.round(n) : null;
}

function toEducation(v: unknown): Education | null {
  if (typeof v !== "string") return null;
  const s = v.toLowerCase();
  if (/phd|doctor/.test(s)) return "PhD";
  if (/master|mba|post ?grad/.test(s)) return "Master's";
  if (/bachelor|graduate|degree/.test(s)) return "Bachelor's";
  if (/high school|12th|school/.test(s)) return "High School";
  return EDUCATION_LEVELS.find((e) => e.toLowerCase() === s) ?? null;
}

function toIntent(v: unknown): RelationshipIntent | null {
  if (typeof v !== "string") return null;
  const s = v.toLowerCase();
  if (/marri/.test(s)) return "Marriage";
  if (/long/.test(s)) return "Long-term";
  if (/casual/.test(s)) return "Casual";
  return RELATIONSHIP_INTENTS.find((i) => i.toLowerCase() === s) ?? null;
}

function toHeight(v: unknown): Height | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return HEIGHTS.find((h) => h === s) ?? null;
}

function toPhrases(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const phrases = v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter((x) => x && x.length <= 60);
  return [...new Set(phrases)].slice(0, 5);
}

/** Coerces any object (LLM output, request body) into valid Preferences. */
export function sanitizePreferences(raw: unknown): Preferences {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  let ageMin = toAge(r.ageMin);
  let ageMax = toAge(r.ageMax);
  if (ageMin !== null && ageMax !== null && ageMin > ageMax) [ageMin, ageMax] = [ageMax, ageMin];

  const prefs: Preferences = {
    ageMin,
    ageMax,
    location: typeof r.location === "string" && r.location.trim() ? r.location.trim() : null,
    smoking: toBool(r.smoking),
    wantsChildren: toBool(r.wantsChildren),
    education: toEducation(r.education),
    relationshipIntent: toIntent(r.relationshipIntent),
    height: toHeight(r.height),
    dealBreakers: [],
    subjective: toPhrases(r.subjective),
  };

  const requested = Array.isArray(r.dealBreakers) ? r.dealBreakers : [];
  prefs.dealBreakers = PREFERENCE_KEYS.filter((k) => requested.includes(k) && isStated(prefs, k));
  return prefs;
}

/** A preference is "stated" if the client specified it (non-null). Only stated preferences are checked or can be deal-breakers. */
export function isStated(p: Preferences, key: PreferenceKey): boolean {
  if (key === "age") return p.ageMin !== null || p.ageMax !== null;
  return p[key] !== null;
}

// ---------- Grounding: never keep a value the client didn't say ----------

// Words that must appear in the client's text for a field to be kept.
const EVIDENCE: Record<Exclude<PreferenceKey, "age" | "location">, RegExp> = {
  height: /\b(short|tall)\b|height|\bfeet\b|\bft\b|\bcm\b/,
  smoking: /smok|cigar|tobacco/,
  wantsChildren: /\b(kids?|child|children|baby|babies|family)\b/,
  education: /educat|degree|graduat|bachelor|master|\bmba\b|\bphd\b|doctorate|post ?grad|school|college|universit|qualif/,
  relationshipIntent: /marri|marry|wedding|settle|long[- ]term|casual|serious|commit|relationship/,
};

/**
 * Drops any extracted value with no evidence in the client's text (defence
 * against an LLM "filling in" typical preferences). Returns what was dropped.
 */
export function keepOnlyGrounded(prefs: Preferences, text: string): { preferences: Preferences; dropped: PreferenceKey[] } {
  const t = text.toLowerCase();
  const p: Preferences = { ...prefs };
  const dropped: PreferenceKey[] = [];

  const inText = (n: number | null) => n === null || new RegExp(`\\b${n}\\b`).test(t);
  if (!inText(p.ageMin) || !inText(p.ageMax)) {
    p.ageMin = p.ageMax = null;
    dropped.push("age");
  }

  if (p.location) {
    const city = normalizeCity(p.location);
    const spellings = [p.location.toLowerCase(), city, ...Object.keys(CITY_ALIASES).filter((a) => CITY_ALIASES[a] === city)];
    if (!spellings.some((sp) => t.includes(sp))) {
      p.location = null;
      dropped.push("location");
    }
  }

  for (const key of Object.keys(EVIDENCE) as (keyof typeof EVIDENCE)[]) {
    if (p[key] !== null && !EVIDENCE[key].test(t)) {
      p[key] = null;
      dropped.push(key);
    }
  }

  p.subjective = p.subjective.filter((phrase) => t.includes(phrase.toLowerCase()));
  p.dealBreakers = p.dealBreakers.filter((k) => isStated(p, k));
  return { preferences: p, dropped };
}

// ---------- Rule-based fallback (no API key needed) ----------

const CITIES = ["Bangalore", "Bengaluru", "Mumbai", "Delhi", "Pune", "Hyderabad", "Chennai", "Kolkata", "Gurgaon", "Noida", "Ahmedabad", "Jaipur"];
// Subjective words we surface to the matchmaker but never match on (no reliable candidate data).
const SUBJECTIVE_WORDS = ["handsome", "good-looking", "good looking", "attractive", "beautiful", "pretty", "cute", "kind", "caring", "funny", "humble", "good personality"];
const STRONG = /deal[- ]?breaker|must|definitely|absolutely|non[- ]?negotiable|strictly|never|(don'?t|do not|won'?t) (want|accept|date)|not ok|no way/i;

export function ruleBasedExtract(text: string): Preferences {
  const t = text.toLowerCase();
  const out: Record<string, unknown> = {
    dealBreakers: [] as PreferenceKey[],
    subjective: SUBJECTIVE_WORDS.filter((w) => new RegExp(`\\b${w}\\b`).test(t)),
  };
  const dealBreakers = out.dealBreakers as PreferenceKey[];

  // Age: "25-30", "25 to 30", "between 25 and 30", "under 30", "at least 25"
  const range = t.match(/(\d{2})\s*(?:-|–|to|and)\s*(\d{2})/);
  if (range) {
    out.ageMin = +range[1];
    out.ageMax = +range[2];
  } else {
    const max = t.match(/(?:under|below|younger than|less than|max(?:imum)?|not older than)\s*(\d{2})/);
    const min = t.match(/(?:over|above|older than|at least|min(?:imum)?)\s*(\d{2})/);
    if (max) out.ageMax = +max[1];
    if (min) out.ageMin = +min[1];
  }

  const city = CITIES.find((c) => t.includes(c.toLowerCase()));
  if (city) out.location = city === "Bengaluru" ? "Bangalore" : city;

  // Work clause by clause so "strong" words only apply to the topic they sit next to.
  for (const clause of t.split(/[.;!?\n,]|\bbut\b/)) {
    const strong = STRONG.test(clause);
    const topics: PreferenceKey[] = [];

    if (/smok|cigarette/.test(clause) && !/smok\w* (is )?(fine|ok|okay)|don'?t mind smok/.test(clause)) {
      out.smoking = false; // in practice, mentioning smoking means "no smokers"
      topics.push("smoking");
    }
    if (/\b(kids?|child|children)\b/.test(clause)) {
      out.wantsChildren = !/(doesn'?t|does not|don'?t|do not|no|not)\s+(want\s+)?(any\s+)?(kids|children)|child-?free/.test(clause);
      topics.push("wantsChildren");
    }
    // Word boundaries matter: "Mumbai" contains "mba".
    if (/\b(phd|doctorate|master|mba\b|post ?grad|bachelor|graduate|degree|educated)/.test(clause)) {
      out.education = /\b(phd|doctorate)/.test(clause)
        ? "PhD"
        : /\b(master|mba\b|post ?grad)/.test(clause)
          ? "Master's"
          : "Bachelor's";
      topics.push("education");
    }
    if (/marri|settle down|long[- ]term|casual/.test(clause)) {
      out.relationshipIntent = /marri|settle down/.test(clause) ? "Marriage" : /long/.test(clause) ? "Long-term" : "Casual";
      topics.push("relationshipIntent");
    }
    const height = /\btall\b/.test(clause)
      ? "tall"
      : /\bshort\b(?![- ]?(term|temper))/.test(clause)
        ? "short"
        : /(average|medium) height/.test(clause)
          ? "average"
          : null;
    if (height) {
      out.height = height;
      topics.push("height");
    }
    if (/\d{2}|\bage\b|years|older|younger/.test(clause)) topics.push("age");
    if (CITIES.some((c) => clause.includes(c.toLowerCase()))) topics.push("location");

    if (strong) dealBreakers.push(...topics);
  }

  return sanitizePreferences(out);
}

// ---------- AI path ----------

// JSON Schema for Groq Structured Outputs, built from the existing type constants
// (not a second hand-written schema). `satisfies` makes the build fail if a
// Preferences field is added or removed without updating this.
const orNull = <T extends readonly string[]>(values: T) => ({ type: ["string", "null"], enum: [...values, null] });

const PREFERENCE_PROPERTIES = {
  ageMin: { type: ["integer", "null"] },
  ageMax: { type: ["integer", "null"] },
  location: { type: ["string", "null"], description: "Single city. Use 'Bangalore' for Bengaluru." },
  smoking: { type: ["boolean", "null"], description: "false = partner must NOT smoke" },
  wantsChildren: { type: ["boolean", "null"], description: "true = partner should want children" },
  education: { ...orNull(EDUCATION_LEVELS), description: "MINIMUM level. 'educated'/'graduate' = Bachelor's" },
  relationshipIntent: orNull(RELATIONSHIP_INTENTS),
  height: orNull(HEIGHTS),
  dealBreakers: { type: "array", items: { type: "string", enum: PREFERENCE_KEYS } },
  subjective: { type: "array", items: { type: "string" }, description: "Subjective wishes copied verbatim, e.g. 'handsome', 'good personality'" },
} satisfies Record<keyof Preferences, object>;

export const PREFERENCES_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: Object.keys(PREFERENCE_PROPERTIES), // strict mode: every field present (null = not specified)
  properties: PREFERENCE_PROPERTIES,
};

const SYSTEM_PROMPT = `You convert a matrimonial client's free-text partner preferences into JSON
matching this schema: ${JSON.stringify(PREFERENCES_JSON_SCHEMA)}

Rules:
- Use null for anything the client did not explicitly mention. Never invent or assume
  "typical" preferences. "I want someone tall" has every field null except height.
- Examples: "25 to 30" / "between 25 and 30" -> ageMin 25, ageMax 30. "Bengaluru" -> "Bangalore".
  "doesn't smoke" / "non-smoker" -> smoking false. "wants kids" -> wantsChildren true;
  "doesn't want kids" -> wantsChildren false. "looking for marriage" -> "Marriage".
- Subjective qualities (looks, personality: handsome, beautiful, caring, good personality...)
  go ONLY in "subjective", never in other fields.
- Put a key in dealBreakers ONLY if the client clearly made it mandatory ("deal-breaker",
  "must", "definitely", "absolutely", "never", "I don't want someone who..."). Soft wording
  ("prefer", "ideally", "would like") is NOT a deal-breaker.`;

export const DEFAULT_MODEL = "openai/gpt-oss-120b";

/** Failure with a message that is safe to show in the UI (never contains the key). */
class AIExtractionError extends Error {}

const redact = (msg: string, secret: string) => msg.split(secret).join("[redacted]");

type ResponseFormat = "json_schema" | "json_object";

async function extractWithAI(text: string, apiKey: string): Promise<{ preferences: Preferences; model: string; responseFormat: ResponseFormat }> {
  const baseUrl = process.env.GROQ_BASE_URL?.trim() || "https://api.groq.com/openai/v1";
  const model = process.env.GROQ_MODEL?.trim() || DEFAULT_MODEL;

  const callGroq = (response_format: object) =>
    fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });

  let res: Response;
  let responseFormat: ResponseFormat = "json_schema";
  try {
    // Preferred: Groq Structured Outputs — the model is constrained to our schema.
    res = await callGroq({ type: "json_schema", json_schema: { name: "preferences", strict: true, schema: PREFERENCES_JSON_SCHEMA } });
    // Some models don't support json_schema: retry once with plain JSON mode (still validated below).
    if (res.status === 400 && /json_schema|response_format|structured/i.test(await res.clone().text())) {
      responseFormat = "json_object";
      res = await callGroq({ type: "json_object" });
    }
  } catch (err) {
    const timedOut = (err as Error).name === "TimeoutError";
    throw new AIExtractionError(timedOut ? "Groq did not respond in time." : "Could not reach Groq (network error).");
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string; code?: string } } | null;
    const detail = redact(body?.error?.message ?? "", apiKey).slice(0, 160);
    if (res.status === 401 || res.status === 403) {
      throw new AIExtractionError(`Groq rejected the API key (HTTP ${res.status}). Check GROQ_API_KEY in server/.env.`);
    }
    if (res.status === 404 || body?.error?.code === "model_not_found") {
      throw new AIExtractionError(`Model "${model}" is not available on Groq. Set GROQ_MODEL in server/.env.`);
    }
    if (res.status === 429) throw new AIExtractionError("Groq rate limit reached (HTTP 429). Try again in a moment.");
    throw new AIExtractionError(`Groq API error (HTTP ${res.status})${detail ? `: ${detail}` : "."}`);
  }

  let parsed: unknown;
  try {
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "");
  } catch {
    throw new AIExtractionError("Groq returned a malformed response (not valid JSON).");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new AIExtractionError("Groq returned a malformed response (expected a JSON object).");
  }
  // Validate against our types even though the schema constrains the model.
  return { preferences: sanitizePreferences(parsed), model, responseFormat };
}

/** Applies the grounding guard and reports anything it removed. */
function grounded(prefs: Preferences, text: string, meta: Omit<ExtractionResult, "preferences">): ExtractionResult {
  const { preferences, dropped } = keepOnlyGrounded(prefs, text);
  if (dropped.length === 0) return { ...meta, preferences };
  const note = `Ignored values not found in the client's words: ${dropped.join(", ")}.`;
  return { ...meta, preferences, warning: meta.warning ? `${meta.warning} ${note}` : note };
}

// Stateless: every call starts from the current text only — nothing from a previous client can leak in.
export async function extractPreferences(text: string): Promise<ExtractionResult> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    return grounded(ruleBasedExtract(text), text, {
      source: "fallback",
      aiError: "GROQ_API_KEY is not set in server/.env, so AI extraction is off.",
    });
  }
  try {
    const { preferences, model, responseFormat } = await extractWithAI(text, apiKey);
    return grounded(preferences, text, { source: "ai", model, responseFormat });
  } catch (err) {
    const aiError = err instanceof AIExtractionError ? err.message : "Unexpected error during AI extraction.";
    console.error(`[extract] AI extraction failed, using rule-based fallback: ${aiError}`); // never logs the key
    return grounded(ruleBasedExtract(text), text, { source: "fallback", aiError });
  }
}
