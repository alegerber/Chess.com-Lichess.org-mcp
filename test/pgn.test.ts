import { test } from "node:test";
import assert from "node:assert/strict";
import * as format from "../src/format.js";

// ─── capText() — size backstop for raw text/PGN output (#46) ──

test("capText returns text unchanged below the cap", () => {
  assert.equal(format.capText("short", 100), "short");
});

test("capText truncates oversized text with a marker", () => {
  const out = format.capText("x".repeat(200), 50);
  assert.ok(out.length < 200);
  assert.match(out, /truncated/);
});

// ─── pgnOrJson() — branch used by game/export tools (#46) ──

test("pgnOrJson returns raw PGN text when asPgn is true", () => {
  const pgn = '[Event "x"]\n\n1. e4 e5 *';
  assert.equal(format.pgnOrJson(pgn, true), pgn);
});

test("pgnOrJson returns a JSON block when asPgn is false", () => {
  const out = format.pgnOrJson({ moves: "e4 e5" }, false);
  assert.equal(out, JSON.stringify({ moves: "e4 e5" }, null, 2));
});
