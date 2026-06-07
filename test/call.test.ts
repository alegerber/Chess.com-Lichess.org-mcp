import { test } from "node:test";
import assert from "node:assert/strict";
import * as chessTools from "../src/tools/chess.js";
import * as lichessTools from "../src/tools/lichess.js";
import { ChessComApiError } from "../src/chess-api.js";
import { LichessApiError } from "../src/lichess-api.js";

// ─── M2: call() wraps every failure mode into a tagged tool result ──

test("chess call() returns formatted text with isError false on success", async () => {
  const r = await chessTools.call(
    async () => 42,
    (n: number) => `n=${n}`,
  );
  assert.equal(r.isError, false);
  assert.equal(r.content[0].text, "n=42");
});

test("chess call() tags a ChessComApiError as isError", async () => {
  const r = await chessTools.call(async () => {
    throw new ChessComApiError(404, "Chess.com API error 404: Not Found");
  }, () => "unused");
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /Chess\.com error \(404\)/);
});

test("chess call() tags a network failure as isError instead of throwing", async () => {
  const r = await chessTools.call(async () => {
    const e = new TypeError("fetch failed");
    (e as { cause?: unknown }).cause = "ENOTFOUND";
    throw e;
  }, () => "unused");
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /Chess\.com request failed/);
  assert.match(r.content[0].text, /ENOTFOUND/);
});

test("lichess call() tags a LichessApiError as isError", async () => {
  const r = await lichessTools.call(async () => {
    throw new LichessApiError(429, "Lichess API error 429: Too Many Requests");
  }, () => "unused");
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /Lichess error \(429\)/);
});
