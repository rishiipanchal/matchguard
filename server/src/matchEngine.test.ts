import assert from "node:assert/strict";
import { test } from "node:test";
import candidates from "./data/candidates.json" with { type: "json" };
import { evaluateCandidate, rankCandidates } from "./matchEngine.js";
import type { Candidate, Preferences } from "./types.js";

const prefs: Preferences = {
  ageMin: 25,
  ageMax: 30,
  location: "Bangalore",
  smoking: false,
  wantsChildren: true,
  education: "Bachelor's",
  relationshipIntent: "Marriage",
  height: null,
  dealBreakers: ["smoking", "wantsChildren"],
  subjective: [],
};

const base: Candidate = {
  id: "t",
  name: "Test",
  age: 27,
  location: "Bangalore",
  education: "Bachelor's",
  occupation: "Engineer",
  smoking: false,
  wantsChildren: true,
  relationshipIntent: "Marriage",
  height: "average",
  bio: "",
};

test("full match is RECOMMENDED at 100", () => {
  const r = evaluateCandidate(prefs, base);
  assert.equal(r.recommendation, "RECOMMENDED");
  assert.equal(r.score, 100);
});

test("deal-breaker mismatch is DO_NOT_SHARE even when everything else matches", () => {
  const r = evaluateCandidate(prefs, { ...base, smoking: true });
  assert.equal(r.recommendation, "DO_NOT_SHARE");
  assert.ok(r.score >= 80, "score is still high — but it must not override the block");
});

test("soft mismatch (age) is REVIEW, not blocked", () => {
  const r = evaluateCandidate(prefs, { ...base, age: 31 });
  assert.equal(r.recommendation, "REVIEW");
  assert.deepEqual(r.mismatches.map((m) => m.key), ["age"]);
});

test("unknown on a deal-breaker is REVIEW, not a mismatch", () => {
  const r = evaluateCandidate(prefs, { ...base, wantsChildren: null });
  assert.equal(r.recommendation, "REVIEW");
  assert.equal(r.mismatches.length, 0);
  assert.deepEqual(r.unknowns.map((u) => u.key), ["wantsChildren"]);
  assert.equal(r.score, 100); // 5/5 known preferences match; the unknown is reported separately, not scored
});

test("city aliases match (Bengaluru = Bangalore)", () => {
  const r = evaluateCandidate(prefs, { ...base, location: "Bengaluru" });
  assert.equal(r.recommendation, "RECOMMENDED");
});

test("education is a minimum level", () => {
  assert.equal(evaluateCandidate(prefs, { ...base, education: "PhD" }).recommendation, "RECOMMENDED");
  assert.equal(evaluateCandidate(prefs, { ...base, education: "High School" }).recommendation, "REVIEW");
});

test("ranking puts blocked candidates last regardless of score", () => {
  const ranked = rankCandidates(prefs, candidates as Candidate[]);
  const firstBlocked = ranked.findIndex((r) => r.recommendation === "DO_NOT_SHARE");
  assert.ok(ranked.slice(firstBlocked).every((r) => r.recommendation === "DO_NOT_SHARE"));
  assert.equal(ranked[0].recommendation, "RECOMMENDED");
});

test("Test 4: only specified preferences are checked and scored", () => {
  const onlyTwo: Preferences = {
    ...prefs,
    ageMin: null, ageMax: null, wantsChildren: null, education: null, relationshipIntent: null,
    height: null, dealBreakers: [], subjective: [],
  };
  // Candidate is wrong on age, children, education and intent — none of which the client specified.
  const r = evaluateCandidate(onlyTwo, { ...base, age: 45, wantsChildren: false, education: "High School", relationshipIntent: "Casual" });
  assert.deepEqual([...r.matches, ...r.mismatches, ...r.unknowns].map((x) => x.key).sort(), ["location", "smoking"]);
  assert.equal(r.score, 100);
  assert.equal(r.recommendation, "RECOMMENDED");
});

test("height: match, mismatch and unknown are distinct from not-specified", () => {
  const h: Preferences = { ...prefs, height: "short" };
  assert.equal(evaluateCandidate(h, { ...base, height: "short" }).recommendation, "RECOMMENDED");
  assert.equal(evaluateCandidate(h, { ...base, height: "tall" }).mismatches[0].key, "height");
  assert.equal(evaluateCandidate(h, { ...base, height: null }).unknowns[0].key, "height");
  assert.equal(evaluateCandidate(prefs, { ...base, height: "tall" }).recommendation, "RECOMMENDED"); // not specified -> ignored
});
