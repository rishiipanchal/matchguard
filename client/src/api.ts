import type { ExtractionResponse, MatchesResponse, Preferences } from "./types";

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Request failed (${res.status})`);
  return res.json() as Promise<T>;
}

export const extractPreferences = (text: string) => post<ExtractionResponse>("/api/preferences/extract", { text });

export const getMatches = (preferences: Preferences) => post<MatchesResponse>("/api/matches", { preferences });
