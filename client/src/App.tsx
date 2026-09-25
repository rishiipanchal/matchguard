import { useState } from "react";
import MatchesPage from "./components/MatchesPage";
import PreferencesPage from "./components/PreferencesPage";
import { EMPTY_PREFERENCES, type Preferences } from "./types";

// The client we are finding matches for (mock).
const CLIENT_NAME = "Rhea Kapoor";

type Tab = "preferences" | "matches";

export default function App() {
  const [tab, setTab] = useState<Tab>("preferences");
  const [preferences, setPreferences] = useState<Preferences>(EMPTY_PREFERENCES);

  const tabClass = (t: Tab) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition ${
      tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
    }`;

  return (
    <div className="min-h-screen text-slate-800">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-xl font-bold">
              <span className="text-rose-600">Match</span>Guard
              <span className="ml-2 text-sm font-normal text-slate-500">AI Matchmaker Pre-Check</span>
            </h1>
            <p className="text-sm text-slate-500">
              Checks every candidate against the client's stated preferences and deal-breakers <em>before</em> it's shared.
            </p>
          </div>
          <div className="text-right text-sm">
            <div className="text-slate-500">Client</div>
            <div className="font-semibold">{CLIENT_NAME}</div>
          </div>
        </div>
        <nav className="mx-auto max-w-6xl px-6 pb-3">
          <div className="inline-flex gap-1 rounded-xl bg-slate-100 p-1">
            <button className={tabClass("preferences")} onClick={() => setTab("preferences")}>
              1 · Client Preferences
            </button>
            <button className={tabClass("matches")} onClick={() => setTab("matches")}>
              2 · Candidate Matches
            </button>
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        {/* Both pages stay mounted so the client's text and its extraction never get out of sync. */}
        <div hidden={tab !== "preferences"}>
          <PreferencesPage preferences={preferences} onChange={setPreferences} onCheck={() => setTab("matches")} />
        </div>
        <div hidden={tab !== "matches"}>
          <MatchesPage preferences={preferences} onEditPreferences={() => setTab("preferences")} />
        </div>
      </main>
    </div>
  );
}
