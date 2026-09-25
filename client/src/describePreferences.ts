import type { PreferenceKey, Preferences } from "./types";

export interface PreferenceRow {
  key: PreferenceKey;
  label: string;
  value: string | null; // null = not specified by the client
  dealBreaker: boolean;
}

/** Human-readable view of every preference field, including the ones the client did not specify. */
export function describePreferences(p: Preferences): PreferenceRow[] {
  const age =
    p.ageMin !== null && p.ageMax !== null
      ? `${p.ageMin}–${p.ageMax}`
      : p.ageMin !== null
        ? `${p.ageMin}+`
        : p.ageMax !== null
          ? `≤ ${p.ageMax}`
          : null;
  const yesNo = (v: boolean | null) => (v === null ? null : v ? "Yes" : "No");

  const rows: [PreferenceKey, string, string | null][] = [
    ["age", "Age", age],
    ["location", "Location", p.location],
    ["smoking", "Smoking", p.smoking === null ? null : p.smoking ? "Smoker" : "Non-smoker only"],
    ["wantsChildren", "Wants children", yesNo(p.wantsChildren)],
    ["education", "Education", p.education && `${p.education}+`],
    ["relationshipIntent", "Relationship intent", p.relationshipIntent],
    ["height", "Height", p.height && p.height[0].toUpperCase() + p.height.slice(1)],
  ];
  return rows.map(([key, label, value]) => ({ key, label, value, dealBreaker: p.dealBreakers.includes(key) }));
}
