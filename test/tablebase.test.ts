import { test } from "node:test";
import assert from "node:assert/strict";
import type { TablebaseResult } from "../src/lichess-api.js";
import * as lichessTools from "../src/tools/lichess.js";

// ─── formatTablebase (#36) ─────────────────────────────────────────

test("formatTablebase renders a winning position with best moves", () => {
  const data: TablebaseResult = {
    category: "win",
    dtz: 15,
    dtm: 15,
    checkmate: false,
    stalemate: false,
    moves: [
      { uci: "f1f6", san: "Qf6", category: "loss", dtz: -14, dtm: -14 },
      { uci: "e1d2", san: "Kd2", category: "win", dtz: 1, dtm: null },
    ],
  };
  const out = lichessTools.formatTablebase(data);
  assert.match(out, /Position: win/);
  assert.match(out, /DTZ 15/);
  assert.match(out, /DTM 15/);
  assert.match(out, /Best moves/);
  assert.match(out, /Qf6: loss/);
});

test("formatTablebase reports a checkmate with no moves", () => {
  const data: TablebaseResult = {
    category: "loss",
    checkmate: true,
    dtz: 0,
    dtm: 0,
    moves: [],
  };
  const out = lichessTools.formatTablebase(data);
  assert.match(out, /Position: checkmate/);
  assert.match(out, /No moves/);
});

test("formatTablebase renders a drawn position", () => {
  const data: TablebaseResult = {
    category: "draw",
    dtz: 0,
    dtm: null,
    moves: [{ uci: "e1e2", san: "Ke2", category: "draw", dtz: 0 }],
  };
  const out = lichessTools.formatTablebase(data);
  assert.match(out, /Position: draw/);
});
