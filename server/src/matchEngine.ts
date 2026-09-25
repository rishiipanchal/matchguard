// Deterministic, explainable match engine. No AI in here on purpose:
// the same preferences + candidate always produce the same result.
//
// Rules:
//   1. Each stated preference is checked -> match | mismatch | unknown.
//   2. Score = matches / preferences we could check (known). Unknowns are
//      kept out of the score and listed separately — they are not mismatches.
//   3. Any deal-breaker mismatch  -> DO_NOT_SHARE, whatever the score.
//      Any soft mismatch or unknown -> REVIEW.
//      Otherwise                  -> RECOMMENDED.
//   4. The matchmaker makes the final call; we only recommend.

import {
  EDUCATION_LEVELS,
  type Candidate,
  type CheckStatus,
  type CriterionResult,
  type MatchResult,
  type PreferenceKey,
  type Preferences,
  type Recommendation,
} from "./types.js";

const LABELS: Record<PreferenceKey, string> = {
  age: "Age",
  height: "Height",
  location: "Location",
  smoking: "Smoking",
  wantsChildren: "Wants children",
  education: "Education",
  relationshipIntent: "Relationship intent",
};

export const CITY_ALIASES: Record<string, string> = {
  bengaluru: "bangalore",
  bombay: "mumbai",
  "new delhi": "delhi",
  gurugram: "gurgaon",
  madras: "chennai",
  calcutta: "kolkata",
};

export function normalizeCity(city: string): string {
  const c = city.trim().toLowerCase();
  return CITY_ALIASES[c] ?? c;
}

const yesNo = (v: boolean | null) => (v === null ? "Unknown" : v ? "Yes" : "No");
const known = <T>(v: T | null, fmt: (x: T) => string = String) => (v === null ? "Unknown" : fmt(v));

type Check = { status: CheckStatus; expected: string; actual: string };

/** Returns one check per preference the client actually stated. Unspecified (null) preferences are skipped entirely. */
function runChecks(p: Preferences, c: Candidate): Partial<Record<PreferenceKey, Check>> {
  const checks: Partial<Record<PreferenceKey, Check>> = {};
  const is = (ok: boolean): CheckStatus => (ok ? "match" : "mismatch");

  if (p.ageMin !== null || p.ageMax !== null) {
    const min = p.ageMin ?? 18;
    const max = p.ageMax ?? 99;
    checks.age = {
      status: is(c.age >= min && c.age <= max),
      expected: p.ageMin !== null && p.ageMax !== null ? `${min}–${max}` : p.ageMin !== null ? `${min}+` : `≤ ${max}`,
      actual: String(c.age),
    };
  }

  if (p.height !== null) {
    checks.height = {
      status: c.height === null ? "unknown" : is(c.height === p.height),
      expected: p.height,
      actual: known(c.height),
    };
  }

  if (p.location) {
    checks.location = {
      status: is(normalizeCity(c.location) === normalizeCity(p.location)),
      expected: p.location,
      actual: c.location,
    };
  }

  if (p.smoking !== null) {
    checks.smoking = {
      status: c.smoking === null ? "unknown" : is(c.smoking === p.smoking),
      expected: p.smoking ? "Smoker" : "Non-smoker",
      actual: known(c.smoking, (s) => (s ? "Smoker" : "Non-smoker")),
    };
  }

  if (p.wantsChildren !== null) {
    checks.wantsChildren = {
      status: c.wantsChildren === null ? "unknown" : is(c.wantsChildren === p.wantsChildren),
      expected: yesNo(p.wantsChildren),
      actual: yesNo(c.wantsChildren),
    };
  }

  if (p.education !== null) {
    const rank = (e: string) => EDUCATION_LEVELS.indexOf(e as (typeof EDUCATION_LEVELS)[number]);
    checks.education = {
      status: c.education === null ? "unknown" : is(rank(c.education) >= rank(p.education)),
      expected: `${p.education}+`,
      actual: known(c.education),
    };
  }

  if (p.relationshipIntent !== null) {
    checks.relationshipIntent = {
      status: c.relationshipIntent === null ? "unknown" : is(c.relationshipIntent === p.relationshipIntent),
      expected: p.relationshipIntent,
      actual: known(c.relationshipIntent),
    };
  }

  return checks;
}

const list = (items: CriterionResult[]) => items.map((i) => i.label.toLowerCase()).join(", ");

function explain(
  rec: Recommendation,
  total: number,
  matches: CriterionResult[],
  mismatches: CriterionResult[],
  unknowns: CriterionResult[],
): string {
  if (total === 0) return "No client preferences captured yet — add preferences before checking candidates.";

  const known = matches.length + mismatches.length;
  const matched = `Matches ${matches.length}/${known} checkable preferences`;

  if (rec === "DO_NOT_SHARE") {
    const broken = mismatches.filter((m) => m.isDealBreaker);
    const detail = broken.map((b) => `${b.label.toLowerCase()} (${b.actual})`).join(", ");
    const verb = broken.length > 1 ? "violate explicit deal-breakers" : "violates an explicit deal-breaker";
    return `${matched}, but ${detail} ${verb}. A high score cannot override a deal-breaker. Do not share.`;
  }

  if (rec === "RECOMMENDED") {
    return `Strong match across all ${total} stated preferences. No deal-breakers detected.`;
  }

  const parts = [matched];
  if (mismatches.length) {
    parts.push(`soft mismatch on ${mismatches.map((m) => `${m.label.toLowerCase()} (${m.actual}, wanted ${m.expected})`).join(", ")}`);
  }
  const unknownBreakers = unknowns.filter((u) => u.isDealBreaker);
  const unknownSoft = unknowns.filter((u) => !u.isDealBreaker);
  if (unknownBreakers.length) parts.push(`${list(unknownBreakers)} is unknown and is a deal-breaker — confirm with the candidate first`);
  if (unknownSoft.length) parts.push(`${list(unknownSoft)} unknown`);
  return `${parts.join("; ")}. Review before sharing.`;
}

export function evaluateCandidate(prefs: Preferences, candidate: Candidate): MatchResult {
  const checks = runChecks(prefs, candidate);

  const results: CriterionResult[] = (Object.keys(checks) as PreferenceKey[]).map((key) => ({
    key,
    label: LABELS[key],
    ...checks[key]!,
    isDealBreaker: prefs.dealBreakers.includes(key),
  }));

  const matches = results.filter((r) => r.status === "match");
  const mismatches = results.filter((r) => r.status === "mismatch");
  const unknowns = results.filter((r) => r.status === "unknown");

  const total = results.length;
  const known = matches.length + mismatches.length;
  const score = known === 0 ? 0 : Math.round((matches.length / known) * 100);

  let recommendation: Recommendation;
  if (mismatches.some((m) => m.isDealBreaker)) recommendation = "DO_NOT_SHARE";
  else if (total === 0 || mismatches.length > 0 || unknowns.length > 0) recommendation = "REVIEW";
  else recommendation = "RECOMMENDED";

  return {
    candidate,
    score,
    recommendation,
    matches,
    mismatches,
    unknowns,
    explanation: explain(recommendation, total, matches, mismatches, unknowns),
  };
}

const ORDER: Record<Recommendation, number> = { RECOMMENDED: 0, REVIEW: 1, DO_NOT_SHARE: 2 };

/** Evaluates every candidate and ranks: Recommended → Review → Do Not Share, then by score. */
export function rankCandidates(prefs: Preferences, candidates: Candidate[]): MatchResult[] {
  return candidates
    .map((c) => evaluateCandidate(prefs, c))
    .sort((a, b) => ORDER[a.recommendation] - ORDER[b.recommendation] || b.score - a.score);
}
