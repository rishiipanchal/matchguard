import assert from "node:assert/strict";
import { test } from "node:test";
import { extractPreferences, keepOnlyGrounded, ruleBasedExtract, sanitizePreferences } from "./preferenceExtractor.js";

test("fallback extracts the brief's example", () => {
  const p = ruleBasedExtract(
    "I'd prefer someone between 25 and 30 from Bangalore. Smoking is a deal-breaker. I'd like someone who wants children and has at least a bachelor's degree.",
  );
  assert.equal(p.ageMin, 25);
  assert.equal(p.ageMax, 30);
  assert.equal(p.location, "Bangalore");
  assert.equal(p.smoking, false);
  assert.equal(p.wantsChildren, true);
  assert.equal(p.education, "Bachelor's");
  assert.deepEqual(p.dealBreakers, ["smoking"]); // "prefer"/"like" are soft
});

test("fallback detects strong language per clause", () => {
  const p = ruleBasedExtract(
    "I don't want someone who smokes. Ideally 25-30, Bangalore, educated, and someone who definitely wants kids.",
  );
  assert.equal(p.smoking, false);
  assert.equal(p.wantsChildren, true);
  assert.equal(p.education, "Bachelor's");
  assert.deepEqual(p.dealBreakers, ["smoking", "wantsChildren"]);
});

test("fallback handles 'doesn't want kids' and marriage intent", () => {
  const p = ruleBasedExtract("Looking for marriage. Someone who doesn't want kids, based in Bengaluru.");
  assert.equal(p.wantsChildren, false);
  assert.equal(p.relationshipIntent, "Marriage");
  assert.equal(p.location, "Bangalore");
});

test("sanitize rejects junk and drops deal-breakers for unstated prefs", () => {
  const p = sanitizePreferences({ ageMin: 40, ageMax: 30, smoking: "no", education: "masters", dealBreakers: ["smoking", "age", "bogus"] });
  assert.equal(p.ageMin, 30); // swapped
  assert.equal(p.ageMax, 40);
  assert.equal(p.smoking, null); // "no" is not a boolean — don't guess
  assert.equal(p.education, "Master's");
  assert.deepEqual(p.dealBreakers, ["age"]);
});

// ---------- Stale / invented preference bug ----------

const UNRELATED_NULLS = (p: Record<string, unknown>, keep: string[]) =>
  ["ageMin", "ageMax", "location", "smoking", "wantsChildren", "education", "relationshipIntent", "height"]
    .filter((k) => !keep.includes(k))
    .forEach((k) => assert.equal(p[k], null, `${k} should be not specified (null)`));

test("Test 1: only location + smoking are extracted, everything else is null", async () => {
  delete process.env.GROQ_API_KEY;
  const { preferences: p } = await extractPreferences("I want someone from Bangalore who doesn't smoke.");
  assert.equal(p.location, "Bangalore");
  assert.equal(p.smoking, false);
  UNRELATED_NULLS({ ...p }, ["location", "smoking"]);
  assert.deepEqual(p.subjective, []);
});

test("Test 2: 'short heighted and handsome' -> height only; handsome is subjective, not a criterion", async () => {
  delete process.env.GROQ_API_KEY;
  const { preferences: p } = await extractPreferences("The person should be short heighted and handsome.");
  assert.equal(p.height, "short");
  UNRELATED_NULLS({ ...p }, ["height"]);
  assert.deepEqual(p.subjective, ["handsome"]);
  assert.deepEqual(p.dealBreakers, []);
});

test("Test 3: a second, different extraction cannot inherit values from the first", async () => {
  delete process.env.GROQ_API_KEY;
  const first = await extractPreferences(
    "Smoking is a deal-breaker. 40-50, Bangalore, bachelor's degree, definitely wants kids, looking for marriage.",
  );
  assert.equal(first.preferences.ageMin, 40); // sanity: first request really had values
  assert.equal(first.preferences.location, "Bangalore");

  const second = await extractPreferences("The person should be short heighted and handsome");
  assert.equal(second.preferences.height, "short");
  UNRELATED_NULLS({ ...second.preferences }, ["height"]);
  assert.deepEqual(second.preferences.dealBreakers, []);
});

test("grounding guard drops values an LLM invents that are not in the client's words", () => {
  const invented = sanitizePreferences({
    ageMin: 40, ageMax: 50, location: "Bangalore", smoking: false, wantsChildren: true,
    education: "Bachelor's", relationshipIntent: "Marriage", height: "short",
    subjective: ["handsome", "rich"], dealBreakers: ["smoking", "height"],
  });
  const { preferences: p, dropped } = keepOnlyGrounded(invented, "The person should be short heighted and handsome");
  assert.equal(p.height, "short");
  UNRELATED_NULLS({ ...p }, ["height"]);
  assert.deepEqual(p.subjective, ["handsome"]); // "rich" was never said
  assert.deepEqual(p.dealBreakers, ["height"]);
  assert.deepEqual(dropped.sort(), ["age", "education", "location", "relationshipIntent", "smoking", "wantsChildren"]);
});

test("'short-term' is not mistaken for a height preference", () => {
  assert.equal(ruleBasedExtract("Nothing short-term please, looking for marriage").height, null);
});

// ---------- UX brief cases (rule-based path; the AI path is checked live and in aiExtraction.test.ts) ----------

test("Brief TEST 1: full example", () => {
  const p = ruleBasedExtract(
    "I don't want someone who smokes. Ideally 25-30, Bangalore, educated, and someone who definitely wants kids. Looking for marriage.",
  );
  assert.deepEqual(
    [p.ageMin, p.ageMax, p.location, p.smoking, p.wantsChildren, p.education, p.relationshipIntent, p.height],
    [25, 30, "Bangalore", false, true, "Bachelor's", "Marriage", null],
  );
});

test("Brief TEST 2: 'tall and caring' -> height + subjective only", () => {
  const p = ruleBasedExtract("I want someone tall and caring.");
  assert.equal(p.height, "tall");
  assert.deepEqual(p.subjective, ["caring"]);
  UNRELATED_NULLS({ ...p }, ["height"]);
});

test("Brief TEST 3: 'Mumbai, age 28-32' -> nothing else (Mumbai must not look like 'MBA')", () => {
  const p = ruleBasedExtract("Someone from Mumbai, age 28-32.");
  assert.deepEqual([p.ageMin, p.ageMax, p.location], [28, 32, "Mumbai"]);
  UNRELATED_NULLS({ ...p }, ["ageMin", "ageMax", "location"]);
});

test("Brief TEST 4: stale data — second extraction keeps nothing from the first", async () => {
  delete process.env.GROQ_API_KEY;
  const first = await extractPreferences("30-40, Bangalore, non-smoker");
  assert.deepEqual([first.preferences.ageMin, first.preferences.location, first.preferences.smoking], [30, "Bangalore", false]);
  const second = await extractPreferences("I want someone tall.");
  assert.equal(second.preferences.height, "tall");
  UNRELATED_NULLS({ ...second.preferences }, ["height"]);
});

test("deal-breaker only for mandatory wording", () => {
  const hard = ruleBasedExtract("I absolutely don't want someone who smokes");
  assert.equal(hard.smoking, false);
  assert.deepEqual(hard.dealBreakers, ["smoking"]);
  const soft = ruleBasedExtract("Prefer someone who doesn't smoke");
  assert.equal(soft.smoking, false);
  assert.deepEqual(soft.dealBreakers, []);
});

test("natural-language mappings", () => {
  assert.deepEqual([ruleBasedExtract("25 to 30").ageMin, ruleBasedExtract("25 to 30").ageMax], [25, 30]);
  assert.deepEqual([ruleBasedExtract("between 25 and 30").ageMin, ruleBasedExtract("between 25 and 30").ageMax], [25, 30]);
  assert.equal(ruleBasedExtract("from Bengaluru").location, "Bangalore");
  assert.equal(ruleBasedExtract("a non-smoker").smoking, false);
  assert.equal(ruleBasedExtract("wants children").wantsChildren, true);
  assert.equal(ruleBasedExtract("doesn't want kids").wantsChildren, false);
  assert.equal(ruleBasedExtract("wants marriage").relationshipIntent, "Marriage");
  assert.equal(ruleBasedExtract("someone short").height, "short");
  assert.deepEqual(ruleBasedExtract("good personality, attractive").subjective, ["attractive", "good personality"]);
});

test("grounding: 'Mumbai' is not evidence for an education value", () => {
  const { preferences } = keepOnlyGrounded(sanitizePreferences({ location: "Mumbai", education: "Master's" }), "Someone from Mumbai");
  assert.equal(preferences.location, "Mumbai");
  assert.equal(preferences.education, null);
});
