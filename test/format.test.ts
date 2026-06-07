import { test } from "node:test";
import assert from "node:assert/strict";
import * as format from "../src/format.js";

// ─── toISOString (M3) ──────────────────────────────────────────────

test("toISOString converts Unix seconds", () => {
  assert.equal(format.toISOString(0, "s"), "1970-01-01T00:00:00.000Z");
});

test("toISOString converts milliseconds by default", () => {
  assert.equal(format.toISOString(0), "1970-01-01T00:00:00.000Z");
});

test("toISOString returns 'unknown' for undefined instead of throwing", () => {
  assert.equal(
    format.toISOString(undefined as unknown as number, "s"),
    "unknown",
  );
});

test("toISOString returns 'unknown' for NaN instead of throwing", () => {
  assert.equal(format.toISOString(NaN), "unknown");
});

// ─── text() isError envelope (M1) ──────────────────────────────────

test("text() defaults isError to false", () => {
  const r = format.text("hello");
  assert.equal(r.isError, false);
  assert.equal(r.content[0].text, "hello");
});

test("text() sets isError true when requested", () => {
  const r = format.text("boom", true);
  assert.equal(r.isError, true);
});

// ─── errorResult() mapping (M1 + M2) ───────────────────────────────

test("errorResult maps a typed API error to a tagged isError result", () => {
  const e = Object.assign(
    new Error("Chess.com API error 404: Not Found for https://api.chess.com/pub/player/x"),
    { name: "ChessComApiError", status: 404 },
  );
  const r = format.errorResult("Chess.com", e);
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /Chess\.com error \(404\)/);
});

test("errorResult maps a network failure (TypeError with cause) to a readable result", () => {
  const e = new TypeError("fetch failed");
  (e as { cause?: unknown }).cause = "ECONNREFUSED";
  const r = format.errorResult("Lichess", e);
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /Lichess request failed/);
  assert.match(r.content[0].text, /ECONNREFUSED/);
});

test("errorResult maps a JSON parse error to an invalid-response result", () => {
  const e = new SyntaxError("Unexpected token < in JSON at position 0");
  const r = format.errorResult("Chess.com", e);
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /invalid response/i);
});
