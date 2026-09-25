# The Date Crew — Product & Tech Generalist Assessment

**Prototype:** MatchGuard, an AI matchmaker pre-check. See [README.md](./README.md) to run it.

---

## PART 1 — Diagnose

| Stage | Count | Step conversion |
|---|---|---|
| Profiles shared | 1,000 | — |
| Accepted | 310 | **31%** |
| Contact shared | 210 | 68% |
| Conversation started | 150 | 71% |
| Meeting fixed | 75 | 50% |
| Meeting completed | 42 | 56% |

Overall, 4.2% of shared profiles lead to a completed meeting.

### Three questions I'd investigate

1. **What are the rejection reasons, field by field?** I'd turn the free-text feedback into structured reasons. For the ~35% that repeat a stated preference, which fields are involved? Did the matchmaker lack the data, or miss it? The answer decides whether the fix is tooling, data or training.
2. **Why is Matchmaker A at 44% and B at 21%?** I'd check client mix and share volume before calling it a skill gap. If A's process is simply more careful, part of the fix is a playbook.
3. **Why do some clients reject profiles and later accept similar ones?** It could be a gap between stated and real preferences, fatigue, or how the profile was presented. This decides how strict any filter should be.

### Biggest problem: shared → accepted

69% of shared profiles (690) are rejected. This is the biggest drop, and it feeds every later stage. About 35% of those rejections (~241) repeat a preference the client had already given us. They are avoidable, because the matchmaker already had the information. Each one wastes a client's attention, costs matchmaker time and erodes trust.

*Assumptions:*
- The 35% is a share of rejections, not of all profiles shared.
- The free-text reasons were classified reliably.
- A and B serve comparable clients.
- The stages line up roughly within the 30 days.

The drop from meeting fixed to completed (56%) also matters. It has a different cause, so I'd investigate it separately.

### Three metrics

1. **Avoidable rejection rate:** rejections whose reason was already in the client's stated preferences ÷ all rejections. This measures the problem directly. The baseline is ~35%.
2. **Acceptance rate per matchmaker:** the outcome this should move (31% overall, 21–44% by matchmaker).
3. **Completed meetings per 100 profiles shared (4.2 today):** a guardrail. It checks that real outcomes improve, not just acceptance from sharing fewer profiles.

---

## PART 2 — Design

### Problem

About 35% of rejections repeat a preference the client had already stated, such as "smokes" or "doesn't want kids". Preferences sit in free-text notes, and a matchmaker searching ~2 hours per client per week can't reliably hold every constraint in their head.

### User

The **matchmaker**, at the moment just before they share a profile. Clients benefit indirectly. Matchmakers with lower acceptance rates, like B, probably gain the most.

### Solution: MatchGuard

MatchGuard is a pre-share check with three steps:

1. **Structure preferences once.** The matchmaker pastes the client's own words. An LLM extracts structured fields: age, location, smoking, children, education and intent. It also flags deal-breakers based on strong language ("never", "definitely"). The matchmaker reviews and edits the result.
2. **Check every candidate.** A deterministic rules engine marks each preference as match, mismatch or unknown. It returns a verdict with a one-line explanation:
   - any deal-breaker mismatch → **Do Not Share**, whatever the score;
   - any soft mismatch or unknown field → **Review**;
   - otherwise → **Recommended**.
3. **Guard the share button.** Sharing is disabled for Do Not Share. For Review, the matchmaker must acknowledge the specific flags first. The matchmaker makes the final call.

### Why AI for extraction but not for matching

**Extraction is a language problem.** Clients say things like "ideally", "definitely not" and "educated". An LLM handles this far better than hand-written rules. Its mistakes are also visible and easy to correct, because the matchmaker reviews the fields before they are used.

**Matching is a decision problem.** Blocking a profile has to be consistent, explainable and auditable:
- The same inputs must always give the same result.
- A deal-breaker can never be traded off against a high score.

A rules engine guarantees both; an LLM doesn't. So AI suggests the inputs, deterministic code makes the check, and the matchmaker decides.

### Unknown information

Missing data is not a mismatch. Unknown fields are left out of the score and listed separately, and they send the candidate to Review ("confirm with the candidate"). Otherwise, incomplete profiles would quietly disappear.

### Data

The inputs are existing client notes and candidate profile fields. The tool adds a structured preference record, a share log with verdicts and overrides, and rejection reasons tagged in structured form, which are needed to measure the metric.

### Technology

React + Tailwind, Node/Express, and a Groq-hosted open model (`openai/gpt-oss-120b`) using strict JSON Schema structured outputs. The AI output is validated on the server, and a rule-based extractor takes over if there is no key or the API is down. The match engine is pure TypeScript with unit tests.

**Two-week plan:**
- Week 1: extraction, rules engine and tests.
- Week 2: UI, integration with candidate data, share logging, and a pilot with 2–3 matchmakers.

### Success metric

**Primary: avoidable rejection rate.** This is the share of rejected profiles whose rejection reason was already in the client's stated preferences. The brief puts it at ~35%. The pilot goal is a clear reduction, for example halving it. The exact target would be set once structured rejection tagging gives a clean baseline.

**Secondary:** acceptance rate.

**Guardrails:**
- Completed meetings per 100 profiles shared should not fall.
- Matchmaker overrides should stay rare. Frequent overrides would mean the rules are wrong.

---

## PART 3 — Prototype

MatchGuard covers the core of the design: capturing preferences, then checking candidates against them.

**Page 1 — Client Preferences**
- A natural-language box with an **"Extract Preferences with AI"** button. It calls Groq when `GROQ_API_KEY` is set. Otherwise it uses a deterministic rule-based fallback, and a badge shows which path ran.
- An editable structured form with a **Deal-breaker** checkbox for each field.
- An "Extracted from client request" list. Anything the client didn't mention shows as *Not specified* and is ignored by matching. Subjective wishes like "handsome" are shown but never matched on.
- Every extraction starts from empty preferences. A grounding check also removes any value that has no evidence in the client's words, so nothing is invented or carried over from a previous client.

**Page 2 — Candidate Matches**
- 12 fictional candidates, covering strong matches, deal-breaker violations, soft mismatches and unknown data.
- Summary counts (recommended / review / blocked), which also work as filters.
- A card for each candidate showing:
  - the score, based on known fields only;
  - the verdict;
  - what matched, what mismatched and what is unknown;
  - a plain-English explanation, e.g. *"Matches 5/6 checkable preferences, but smoking (Smoker) violates an explicit deal-breaker. A high score cannot override a deal-breaker. Do not share."*
- **Share Recommendation** is disabled for blocked candidates. For Review candidates, it asks the matchmaker to confirm the flags first.

**Code structure**
- `matchEngine.ts` contains the deterministic rules as pure functions.
- `preferenceExtractor.ts` contains the AI call, the fallback and the validator. Both extraction paths return the same validated shape.
- `index.ts` contains the three API endpoints.

**Unit tests** cover:
- a deal-breaker always blocks;
- unknown is neither a mismatch nor scored;
- preferences the client didn't specify are never checked, and no values carry over between extractions;
- Bengaluru is treated as Bangalore;
- education is a minimum level;
- the fallback extracts the brief's examples correctly.

**Testing:** the full flow was tested with a live Groq key: client text → React → Express → Groq → structured fields in the UI. If the key is missing or invalid, or the API or its output fails, the app falls back to rule-based extraction and shows the reason.

---

## PART 4 — Curveball

*Two weeks after launch, the avoidable rejection rate hasn't moved.*

**1. Check first: adoption.** How many shares went through MatchGuard, per matchmaker? How often were Review flags overridden? A tool nobody opens can't move a metric.

**2. Data to look at:**
- **Share logs.** Did the rejected profiles pass through MatchGuard, and what verdict did they get?
- **The remaining avoidable rejections.** Was the preference captured in structured form? Was the candidate's field unknown? Was it a field we don't model (religion, height, diet)?
- **Extraction accuracy.** Compare the AI output with the matchmakers' corrections.
- **Metric plumbing.** If rejection reasons are still hand-classified free text, the metric may just be lagging.

**3. Decision:**
- **Low usage → iterate on workflow:** build the check into the share step.
- **Misses on unmodelled or unknown fields → iterate on coverage:** add fields and enrich profiles.
- **Used and covered, but no change → change the solution:** stated preferences aren't the real ones, so learn from revealed preferences instead.

I'd only kill it if usage is healthy *and* avoidable rejections turn out to be rare.

---

## AI Usage

- I used Claude Code to scaffold the React/Express app, write unit tests and draft the written answers, which I then reviewed and edited.
- Inside the product, a Groq-hosted model (`openai/gpt-oss-120b`) turns a client's free-text preferences into structured fields. The matching decision itself uses no AI.
- One change I made: Claude's first version gave unknown fields "half credit" in the match score. I found that arbitrary. Unknowns are now left out of the score, shown separately, and send the candidate to Review.
