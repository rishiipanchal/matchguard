import { useEffect, useState } from "react";
import { getMatches } from "../api";
import type { MatchesResponse, Preferences, Recommendation } from "../types";
import { describePreferences } from "../describePreferences";
import CandidateCard from "./CandidateCard";
import { SubjectiveNote } from "./PreferencesPage";

interface Props {
  preferences: Preferences;
  onEditPreferences: () => void;
}

type Filter = "ALL" | Recommendation;

export default function MatchesPage({ preferences, onEditPreferences }: Props) {
  const [data, setData] = useState<MatchesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [shared, setShared] = useState<Set<string>>(new Set());

  useEffect(() => {
    getMatches(preferences)
      .then(setData)
      .catch((e: Error) => setError(`${e.message} — is the server running on :3001?`));
  }, [preferences]);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!data) return <p className="text-slate-500">Checking candidates…</p>;

  const { summary } = data;
  const nothingStated = describePreferences(data.preferences).every((r) => r.value === null);

  if (nothingStated) {
    return (
      <div className="space-y-4">
        <PreferenceSummary preferences={data.preferences} onEdit={onEditPreferences} />
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
          No structured preferences to check yet. Extract or enter the client's preferences first.
        </p>
      </div>
    );
  }
  const visible = data.results.filter((r) => filter === "ALL" || r.recommendation === filter);

  const tiles: { key: Filter; label: string; value: number; tone: string }[] = [
    { key: "ALL", label: "Candidates checked", value: summary.total, tone: "border-slate-300 text-slate-800" },
    { key: "RECOMMENDED", label: "Recommended", value: summary.recommended, tone: "border-emerald-300 text-emerald-700" },
    { key: "REVIEW", label: "Needs review", value: summary.review, tone: "border-amber-300 text-amber-700" },
    { key: "DO_NOT_SHARE", label: "Blocked (deal-breaker)", value: summary.doNotShare, tone: "border-red-300 text-red-700" },
  ];

  return (
    <div className="space-y-5">
      <PreferenceSummary preferences={data.preferences} onEdit={onEditPreferences} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`rounded-xl border-2 bg-white p-4 text-left transition ${t.tone} ${
              filter === t.key ? "ring-2 ring-slate-900/10" : "border-opacity-40 opacity-80 hover:opacity-100"
            }`}
          >
            <div className="text-2xl font-bold">{t.value}</div>
            <div className="text-xs font-medium uppercase tracking-wide">{t.label}</div>
          </button>
        ))}
      </div>

      {summary.doNotShare > 0 && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-800">
          🛡️ MatchGuard stopped <strong>{summary.doNotShare}</strong> profile{summary.doNotShare > 1 ? "s" : ""} that would
          have violated a stated deal-breaker — the kind of rejection the client has already told us about.
        </p>
      )}

      <div className="space-y-4">
        {visible.map((r) => (
          <CandidateCard
            key={r.candidate.id}
            result={r}
            shared={shared.has(r.candidate.id)}
            onShare={() => setShared((s) => new Set(s).add(r.candidate.id))}
          />
        ))}
      </div>
    </div>
  );
}

function PreferenceSummary({ preferences, onEdit }: { preferences: Preferences; onEdit: () => void }) {
  const rows = describePreferences(preferences);
  const stated = rows.filter((r) => r.value !== null);
  const notSpecified = rows.filter((r) => r.value === null);

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 font-medium text-slate-600">
          Checking against {stated.length} stated preference{stated.length === 1 ? "" : "s"}:
        </span>
        {stated.map((r) => (
          <span key={r.key} className={`rounded-full px-2.5 py-1 ${r.dealBreaker ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700"}`}>
            {r.label}: <strong>{r.value}</strong>
            {r.dealBreaker && " · deal-breaker"}
          </span>
        ))}
        <button onClick={onEdit} className="ml-auto text-sm font-medium text-rose-600 hover:underline">
          Edit preferences
        </button>
      </div>
      {notSpecified.length > 0 && (
        <p className="text-xs text-slate-400">
          Not specified by client (ignored): {notSpecified.map((r) => r.label.toLowerCase()).join(", ")}
        </p>
      )}
      <SubjectiveNote phrases={preferences.subjective} />
    </div>
  );
}
