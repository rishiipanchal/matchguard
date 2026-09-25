// Shared domain types.
// In Preferences, `null` = NOT SPECIFIED by the client (never checked).
// In Candidate,   `null` = UNKNOWN about the candidate (checked -> "unknown").

export const EDUCATION_LEVELS = ["High School", "Bachelor's", "Master's", "PhD"] as const;
export type Education = (typeof EDUCATION_LEVELS)[number];

export const RELATIONSHIP_INTENTS = ["Marriage", "Long-term", "Casual"] as const;
export type RelationshipIntent = (typeof RELATIONSHIP_INTENTS)[number];

export const HEIGHTS = ["short", "average", "tall"] as const;
export type Height = (typeof HEIGHTS)[number];

export type PreferenceKey =
  | "age"
  | "height"
  | "location"
  | "smoking"
  | "wantsChildren"
  | "education"
  | "relationshipIntent";

export interface Preferences {
  ageMin: number | null;
  ageMax: number | null;
  location: string | null;
  smoking: boolean | null; // false = wants a non-smoker
  wantsChildren: boolean | null;
  education: Education | null; // minimum level, e.g. "Bachelor's" = Bachelor's+
  relationshipIntent: RelationshipIntent | null;
  height: Height | null;
  dealBreakers: PreferenceKey[]; // preferences that must never be violated
  subjective: string[]; // e.g. "handsome" — shown to the matchmaker, NOT used for matching
}

/** Everything "not specified" — the starting point for every extraction. */
export const EMPTY_PREFERENCES: Preferences = {
  ageMin: null,
  ageMax: null,
  location: null,
  smoking: null,
  wantsChildren: null,
  education: null,
  relationshipIntent: null,
  height: null,
  dealBreakers: [],
  subjective: [],
};

export interface Candidate {
  id: string;
  name: string;
  age: number;
  location: string;
  education: Education | null;
  occupation: string;
  smoking: boolean | null;
  wantsChildren: boolean | null;
  relationshipIntent: RelationshipIntent | null;
  height: Height | null;
  bio: string;
}

export type CheckStatus = "match" | "mismatch" | "unknown";

export interface CriterionResult {
  key: PreferenceKey;
  label: string;
  status: CheckStatus;
  expected: string;
  actual: string;
  isDealBreaker: boolean;
}

export type Recommendation = "RECOMMENDED" | "REVIEW" | "DO_NOT_SHARE";

export interface MatchResult {
  candidate: Candidate;
  score: number; // 0–100
  recommendation: Recommendation;
  matches: CriterionResult[];
  mismatches: CriterionResult[];
  unknowns: CriterionResult[];
  explanation: string;
}
