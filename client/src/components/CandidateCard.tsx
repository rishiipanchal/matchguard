import type { CriterionResult, MatchResult, Recommendation } from "../types";

const BADGE: Record<Recommendation, { label: string; className: string; bar: string }> = {
  RECOMMENDED: { label: "✓ Recommended", className: "bg-emerald-100 text-emerald-800", bar: "bg-emerald-500" },
  REVIEW: { label: "⚠ Review", className: "bg-amber-100 text-amber-800", bar: "bg-amber-500" },
  DO_NOT_SHARE: { label: "⛔ Do Not Share", className: "bg-red-100 text-red-800", bar: "bg-red-500" },
};

interface Props {
  result: MatchResult;
  shared: boolean;
  onShare: () => void;
}

export default function CandidateCard({ result, shared, onShare }: Props) {
  const { candidate: c, score, recommendation, matches, mismatches, unknowns, explanation } = result;
  const badge = BADGE[recommendation];
  const blocked = recommendation === "DO_NOT_SHARE";
  const stated = matches.length + mismatches.length + unknowns.length;

  function handleShare() {
    // Review candidates can be shared, but the matchmaker must consciously accept the flags.
    if (recommendation === "REVIEW") {
      const flags = [...mismatches, ...unknowns].map((f) => `• ${f.label}: ${f.actual} (wanted ${f.expected})`).join("\n");
      if (!window.confirm(`Share ${c.name} despite these flags?\n\n${flags}`)) return;
    }
    onShare();
  }

  return (
    <article className={`rounded-xl border bg-white p-5 shadow-sm ${blocked ? "border-red-200 bg-red-50/30" : "border-slate-200"}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{c.name}</h3>
          <p className="text-sm text-slate-500">
            {c.age} · {c.location} · {c.occupation} · {c.education ?? "Education unknown"}
          </p>
          <p className="mt-1 max-w-2xl text-sm italic text-slate-500">"{c.bio}"</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-28 text-right">
            <div className="text-2xl font-bold">{score}%</div>
            <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100">
              <div className={`h-1.5 rounded-full ${badge.bar}`} style={{ width: `${score}%` }} />
            </div>
            <div className="mt-0.5 text-xs text-slate-400">
              {unknowns.length ? `score on ${stated - unknowns.length}/${stated} known` : "match score"}
            </div>
          </div>
          <span className={`whitespace-nowrap rounded-full px-3 py-1 text-sm font-semibold ${badge.className}`}>{badge.label}</span>
        </div>
      </div>

      <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${blocked ? "bg-red-100 text-red-900" : "bg-slate-50 text-slate-700"}`}>
        {explanation}
      </p>

      <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
        <CheckList title="Matching" items={matches} tone="text-emerald-700" icon="✓" />
        <CheckList title="Mismatches" items={mismatches} tone="text-red-700" icon="✗" />
        <CheckList title="Unknown" items={unknowns} tone="text-amber-700" icon="?" />
      </div>

      <div className="mt-4 flex items-center justify-end gap-3">
        {blocked && <span className="text-xs text-red-700">Sharing disabled — violates a client deal-breaker.</span>}
        <button
          onClick={handleShare}
          disabled={blocked || shared}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            shared
              ? "bg-emerald-50 text-emerald-700"
              : blocked
                ? "cursor-not-allowed bg-slate-100 text-slate-400"
                : "bg-rose-600 text-white hover:bg-rose-700"
          }`}
        >
          {shared ? "✓ Shared with client" : "Share Recommendation"}
        </button>
      </div>
    </article>
  );
}

function CheckList({ title, items, tone, icon }: { title: string; items: CriterionResult[]; tone: string; icon: string }) {
  return (
    <div>
      <div className={`mb-1 text-xs font-semibold uppercase tracking-wide ${tone}`}>
        {title} ({items.length})
      </div>
      {items.length === 0 ? (
        <div className="text-slate-400">—</div>
      ) : (
        <ul className="space-y-0.5">
          {items.map((i) => (
            <li key={i.key} className="text-slate-700">
              <span className={tone}>{icon}</span> {i.label}: <strong>{i.actual}</strong>
              {i.status !== "match" && <span className="text-slate-400"> (wanted {i.expected})</span>}
              {i.isDealBreaker && i.status !== "match" && (
                <span className="ml-1 whitespace-nowrap rounded bg-red-600 px-1 text-[10px] font-bold uppercase text-white">deal-breaker</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
