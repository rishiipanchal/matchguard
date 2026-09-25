// AI path tests with a mocked fetch — deterministic, no network, no real key needed.
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { DEFAULT_MODEL, extractPreferences, PREFERENCES_JSON_SCHEMA } from "./preferenceExtractor.js";
import { EMPTY_PREFERENCES } from "./types.js";

const FAKE_KEY = "gsk_FAKE_TEST_KEY_do_not_leak";
const realFetch = globalThis.fetch;
let calls: { url: string; init: RequestInit }[] = [];

function mockFetch(respond: () => Response | Promise<Response>) {
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return respond();
  }) as typeof fetch;
}
const chat = (content: string) => Response.json({ choices: [{ message: { content } }] });

beforeEach(() => {
  calls = [];
  process.env.GROQ_API_KEY = FAKE_KEY;
  delete process.env.GROQ_MODEL;
  delete process.env.GROQ_BASE_URL;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.GROQ_API_KEY;
});

const noKeyLeak = (result: unknown) => assert.ok(!JSON.stringify(result).includes(FAKE_KEY), "API key leaked into the result");

test("success: calls Groq's OpenAI-compatible endpoint and returns grounded AI preferences", async () => {
  mockFetch(() => chat(JSON.stringify({ height: "short", subjective: ["handsome"], location: "Bangalore" })));
  const r = await extractPreferences("The person should be short heighted and handsome");

  assert.equal(r.source, "ai");
  assert.equal(r.model, DEFAULT_MODEL);
  assert.equal(r.preferences.height, "short");
  assert.deepEqual(r.preferences.subjective, ["handsome"]);
  assert.equal(r.preferences.location, null); // invented by the "LLM" -> removed by the grounding guard
  assert.match(r.warning ?? "", /location/);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, `Bearer ${FAKE_KEY}`);
  const body = JSON.parse(String(calls[0].init.body));
  assert.equal(body.model, DEFAULT_MODEL);
  // Groq Structured Outputs, strict, with our schema
  assert.equal(body.response_format.type, "json_schema");
  assert.equal(body.response_format.json_schema.strict, true);
  assert.deepEqual(body.response_format.json_schema.schema, PREFERENCES_JSON_SCHEMA);
  assert.equal(r.responseFormat, "json_schema");
  noKeyLeak(r);
});

test("schema covers exactly the Preferences fields and all are required (strict mode)", () => {
  const fields = Object.keys(EMPTY_PREFERENCES).sort();
  assert.deepEqual(Object.keys(PREFERENCES_JSON_SCHEMA.properties).sort(), fields);
  assert.deepEqual([...PREFERENCES_JSON_SCHEMA.required].sort(), fields);
  assert.equal(PREFERENCES_JSON_SCHEMA.additionalProperties, false);
});

test("model without json_schema support: retries once in JSON mode and still validates", async () => {
  let n = 0;
  mockFetch(() =>
    n++ === 0
      ? Response.json({ error: { message: "response_format json_schema is not supported by this model" } }, { status: 400 })
      : chat(JSON.stringify({ height: "tall", subjective: ["caring"] })),
  );
  const r = await extractPreferences("I want someone tall and caring.");
  assert.equal(calls.length, 2);
  assert.equal(JSON.parse(String(calls[1].init.body)).response_format.type, "json_object");
  assert.equal(r.source, "ai");
  assert.equal(r.responseFormat, "json_object");
  assert.equal(r.preferences.height, "tall");
});

test("missing key: no request is made, rule-based fallback with a clear message", async () => {
  delete process.env.GROQ_API_KEY;
  mockFetch(() => chat("{}"));
  const r = await extractPreferences("Bangalore, non-smoker");
  assert.equal(calls.length, 0);
  assert.equal(r.source, "fallback");
  assert.match(r.aiError ?? "", /GROQ_API_KEY is not set/);
  assert.equal(r.preferences.location, "Bangalore");
});

test("invalid key (401): fallback with a useful message", async () => {
  mockFetch(() => Response.json({ error: { message: "Invalid API Key", code: "invalid_api_key" } }, { status: 401 }));
  const r = await extractPreferences("Bangalore, non-smoker");
  assert.equal(r.source, "fallback");
  assert.match(r.aiError ?? "", /rejected the API key/);
  assert.equal(r.preferences.smoking, false); // fallback still extracted
  noKeyLeak(r);
});

test("unknown model (404): message names the model", async () => {
  mockFetch(() => Response.json({ error: { message: "model not found", code: "model_not_found" } }, { status: 404 }));
  const r = await extractPreferences("Bangalore");
  assert.match(r.aiError ?? "", new RegExp(`Model "${DEFAULT_MODEL}" is not available`));
});

test("Groq server error: key is redacted even if the provider echoes it", async () => {
  mockFetch(() => Response.json({ error: { message: `upstream failure for ${FAKE_KEY}` } }, { status: 500 }));
  const r = await extractPreferences("Bangalore");
  assert.equal(r.source, "fallback");
  assert.match(r.aiError ?? "", /HTTP 500/);
  assert.match(r.aiError ?? "", /\[redacted\]/);
  noKeyLeak(r);
});

test("malformed AI output (not JSON / not an object): fallback", async () => {
  for (const content of ["Sure! Here are the preferences: age 25-30", "[1,2,3]", ""]) {
    mockFetch(() => chat(content));
    const r = await extractPreferences("Ideally 25-30");
    assert.equal(r.source, "fallback", `content: ${content}`);
    assert.match(r.aiError ?? "", /malformed/);
    assert.equal(r.preferences.ageMin, 25);
  }
});

test("network failure: fallback with 'could not reach' message", async () => {
  mockFetch(() => {
    throw new TypeError("fetch failed");
  });
  const r = await extractPreferences("Bangalore");
  assert.equal(r.source, "fallback");
  assert.match(r.aiError ?? "", /Could not reach Groq/);
});
