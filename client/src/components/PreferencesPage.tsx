import { useState, type ReactNode } from "react";
import { extractPreferences } from "../api";
import { describePreferences } from "../describePreferences";
import {
  EDUCATION_LEVELS,
  EMPTY_PREFERENCES,
  HEIGHTS,
  RELATIONSHIP_INTENTS,
  type Education,
  type ExtractionResponse,
  type Height,
  type PreferenceKey,
  type Preferences,
  type RelationshipIntent,
} from "../types";

const EXAMPLE_TEXT =
  "I don't want someone who smokes. Ideally 25-30, Bangalore, educated, and someone who definitely wants kids. Looking for marriage.";

interface Props {
  preferences: Preferences;
  onChange: (p: Preferences) => void;
  onCheck: () => void;
}

// <select> helpers for nullable booleans: "" = not specified.
const boolToSelect = (v: boolean | null) => (v === null ? "" : v ? "yes" : "no");
const selectToBool = (v: string) => (v === "" ? null : v === "yes");
const numOrNull = (v: string) => (v === "" ? null : Number(v));

export default function PreferencesPage({ preferences: p, onChange, onCheck }: Props) {
  const [text, setText] = useState(EXAMPLE_TEXT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastExtraction, setLastExtraction] = useState<ExtractionResponse | null>(null);
  const [extractedText, setExtractedText] = useState<string | null>(null);

  const set = (patch: Partial<Preferences>) => onChange({ ...p, ...patch });
  const textChangedSinceExtraction = extractedText !== null && text.trim() !== extractedText;

  const toggleDealBreaker = (key: PreferenceKey) =>
    set({
      dealBreakers: p.dealBreakers.includes(key) ? p.dealBreakers.filter((k) => k !== key) : [...p.dealBreakers, key],
    });

  async function handleExtract() {
    // Clear the previous client's structured preferences first, so nothing stale
    // survives — even if this extraction fails.
    onChange(EMPTY_PREFERENCES);
    setLastExtraction(null);
    setExtractedText(null);
    setLoading(true);
    setError(null);
    try {
      const result = await extractPreferences(text);
      setLastExtraction(result);
      setExtractedText(text.trim());
      onChange(result.preferences);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const input = "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-rose-400 focus:outline-none";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ---------- Natural language input ---------- */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold">What did the client say?</h2>
        <p className="mb-3 text-sm text-slate-500">
          Paste the client's preferences in their own words. AI converts them into structured fields you can edit.
        </p>
        <textarea
          className={`${input} h-36 resize-y`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Ideally 25–30, Bangalore. Smoking is a deal-breaker…"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={handleExtract}
            disabled={loading || !text.trim()}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {loading ? "Extracting preferences…" : "✨ Extract Preferences with AI"}
          </button>
          {lastExtraction && (
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                lastExtraction.source === "ai" ? "bg-violet-100 text-violet-700" : "bg-amber-100 text-amber-800"
              }`}
            >
              {lastExtraction.source === "ai" ? `Extracted by AI (${lastExtraction.model})` : "Rule-based fallback"}
            </span>
          )}
        </div>
        {textChangedSinceExtraction && (
          <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            The client request has changed since the last extraction. Click Extract to update the structured preferences.
          </p>
        )}
        {lastExtraction?.aiError && (
          <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            <strong>AI extraction unavailable:</strong> {lastExtraction.aiError} Used the rule-based extractor instead, so
            please check the fields carefully.
          </p>
        )}
        {lastExtraction?.warning && <p className="mt-2 text-xs text-amber-700">{lastExtraction.warning}</p>}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        {lastExtraction && (
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Extracted from client request</h3>
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {describePreferences(lastExtraction.preferences).map((row) => (
                <li key={row.key} className="flex justify-between py-1">
                  <span className="text-slate-500">{row.label}</span>
                  {row.value === null ? (
                    <span className="italic text-slate-400">Not specified</span>
                  ) : (
                    <span className="font-medium">
                      {row.value}
                      {row.dealBreaker && <span className="ml-1 text-xs text-red-600">(deal-breaker)</span>}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <SubjectiveNote phrases={lastExtraction.preferences.subjective} />
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-slate-500">Raw JSON</summary>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
                {JSON.stringify(lastExtraction.preferences, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </section>

      {/* ---------- Structured, editable preferences ---------- */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold">Structured preferences</h2>
        <p className="mb-4 text-sm text-slate-500">
          Only filled-in fields are checked. Leave a field as <em>Not specified</em> if the client didn't mention it. Tick{" "}
          <strong>Deal-breaker</strong> for anything that must never be violated.
        </p>
        {loading ? (
          <p className="mb-3 animate-pulse rounded-md bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
            Extracting preferences from the client's words… fields were cleared and will fill in automatically.
          </p>
        ) : (
          !lastExtraction && (
            <p className="mb-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
              Nothing extracted yet. Click <strong>Extract</strong>, or fill in the fields manually.
            </p>
          )
        )}

        {/* Locked while extracting so nothing is half-edited mid-request. */}
        <fieldset disabled={loading} className={`divide-y divide-slate-100 ${loading ? "opacity-50" : ""}`}>
          <Row label="Age" field="age" p={p} onToggle={toggleDealBreaker}>
            <div className="flex items-center gap-2">
              <input type="number" className={input} value={p.ageMin ?? ""} placeholder="Not set" onChange={(e) => set({ ageMin: numOrNull(e.target.value) })} />
              <span className="text-slate-400">–</span>
              <input type="number" className={input} value={p.ageMax ?? ""} placeholder="Not set" onChange={(e) => set({ ageMax: numOrNull(e.target.value) })} />
            </div>
          </Row>

          <Row label="Location" field="location" p={p} onToggle={toggleDealBreaker}>
            <input className={input} value={p.location ?? ""} placeholder="Not specified" onChange={(e) => set({ location: e.target.value || null })} />
          </Row>

          <Row label="Smoking" field="smoking" p={p} onToggle={toggleDealBreaker}>
            <select className={input} value={boolToSelect(p.smoking)} onChange={(e) => set({ smoking: selectToBool(e.target.value) })}>
              <option value="">Not specified</option>
              <option value="no">No — non-smoker only</option>
              <option value="yes">Yes — smoker</option>
            </select>
          </Row>

          <Row label="Wants children" field="wantsChildren" p={p} onToggle={toggleDealBreaker}>
            <select className={input} value={boolToSelect(p.wantsChildren)} onChange={(e) => set({ wantsChildren: selectToBool(e.target.value) })}>
              <option value="">Not specified</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </Row>

          <Row label="Education" field="education" p={p} onToggle={toggleDealBreaker}>
            <select className={input} value={p.education ?? ""} onChange={(e) => set({ education: (e.target.value || null) as Education | null })}>
              <option value="">Not specified</option>
              {EDUCATION_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl}+
                </option>
              ))}
            </select>
          </Row>

          <Row label="Relationship intent" field="relationshipIntent" p={p} onToggle={toggleDealBreaker}>
            <select
              className={input}
              value={p.relationshipIntent ?? ""}
              onChange={(e) => set({ relationshipIntent: (e.target.value || null) as RelationshipIntent | null })}
            >
              <option value="">Not specified</option>
              {RELATIONSHIP_INTENTS.map((i) => (
                <option key={i}>{i}</option>
              ))}
            </select>
          </Row>

          <Row label="Height" field="height" p={p} onToggle={toggleDealBreaker}>
            <select className={input} value={p.height ?? ""} onChange={(e) => set({ height: (e.target.value || null) as Height | null })}>
              <option value="">Not specified</option>
              {HEIGHTS.map((h) => (
                <option key={h} value={h}>
                  {h[0].toUpperCase() + h.slice(1)}
                </option>
              ))}
            </select>
          </Row>
        </fieldset>

        <button onClick={onCheck} disabled={loading} className="mt-5 w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
          Check candidates against these preferences →
        </button>
      </section>
    </div>
  );
}

export function SubjectiveNote({ phrases }: { phrases: string[] }) {
  if (phrases.length === 0) return null;
  return (
    <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
      Subjective preference detected: {phrases.map((ph) => `"${ph}"`).join(", ")}. Not used for automated matching — the
      matchmaker judges this.
    </p>
  );
}

function Row(props: { label: string; field: PreferenceKey; p: Preferences; onToggle: (k: PreferenceKey) => void; children: ReactNode }) {
  const { label, field, p, onToggle, children } = props;
  const checked = p.dealBreakers.includes(field);
  return (
    <div className="grid grid-cols-[8.5rem_1fr_auto] items-center gap-3 py-2.5">
      <label className="text-sm font-medium text-slate-600">{label}</label>
      {children}
      <label className={`flex cursor-pointer items-center gap-1.5 text-xs ${checked ? "font-semibold text-red-600" : "text-slate-400"}`}>
        <input type="checkbox" className="accent-red-600" checked={checked} onChange={() => onToggle(field)} />
        Deal-breaker
      </label>
    </div>
  );
}
