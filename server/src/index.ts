import dotenv from "dotenv";
import cors from "cors";
import express from "express";
import { fileURLToPath } from "node:url";
import candidatesData from "./data/candidates.json" with { type: "json" };
import { rankCandidates } from "./matchEngine.js";
import { DEFAULT_MODEL, extractPreferences, sanitizePreferences } from "./preferenceExtractor.js";
import type { Candidate, Recommendation } from "./types.js";

// Loads server/.env (the key stays server-side; it is never sent to the browser or logged).
// Resolved relative to this file (src/ or dist/), so it works whatever the working directory is.
dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });

const candidates = candidatesData as Candidate[];
const app = express();
app.use(cors());
app.use(express.json());

// List the (mock) candidate pool.
app.get("/api/candidates", (_req, res) => {
  res.json({ candidates });
});

// Free text -> structured preferences (AI, with deterministic fallback).
app.post("/api/preferences/extract", async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) {
    res.status(400).json({ error: "Body must include non-empty 'text'." });
    return;
  }
  res.json(await extractPreferences(text));
});

// Structured preferences -> ranked, explained candidate results.
app.post("/api/matches", (req, res) => {
  const preferences = sanitizePreferences(req.body?.preferences);
  const results = rankCandidates(preferences, candidates);
  const count = (r: Recommendation) => results.filter((x) => x.recommendation === r).length;
  res.json({
    preferences,
    results,
    summary: {
      total: results.length,
      recommended: count("RECOMMENDED"),
      review: count("REVIEW"),
      doNotShare: count("DO_NOT_SHARE"),
    },
  });
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  const mode = process.env.GROQ_API_KEY?.trim()
    ? `AI (Groq, ${process.env.GROQ_MODEL?.trim() || DEFAULT_MODEL}) — GROQ_API_KEY detected`
    : "rule-based fallback (no GROQ_API_KEY)";
  console.log(`MatchGuard API on http://localhost:${port} — extraction mode: ${mode}`);
});
