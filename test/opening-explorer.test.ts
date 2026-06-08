import { test } from "node:test";
import assert from "node:assert/strict";
import type { ExplorerResult } from "../src/lichess-api.js";
import * as lichessTools from "../src/tools/lichess.js";

// ─── formatOpeningExplorer (#35) ───────────────────────────────────

test("formatOpeningExplorer renders opening, totals, and top moves", () => {
  const data: ExplorerResult = {
    white: 1000,
    draws: 200,
    black: 800,
    opening: { eco: "B00", name: "King's Pawn Game" },
    moves: [
      { uci: "e2e4", san: "e4", white: 500, draws: 100, black: 400, averageRating: 2200 },
      { uci: "d2d4", san: "d4", white: 300, draws: 60, black: 240, averageRating: 2150 },
    ],
  };
  const out = lichessTools.formatOpeningExplorer(data);
  assert.match(out, /Opening: King's Pawn Game \(B00\)/);
  assert.match(out, /Total games: 2000/);
  assert.match(out, /Top moves:/);
  assert.match(out, /e4: 1000 games/);
  assert.match(out, /avg 2200/);
});

test("formatOpeningExplorer falls back to averageOpponentRating (player db)", () => {
  const data: ExplorerResult = {
    white: 10,
    draws: 1,
    black: 9,
    opening: null,
    moves: [
      { uci: "e2e4", san: "e4", white: 5, draws: 1, black: 4, averageOpponentRating: 1700 },
    ],
  };
  const out = lichessTools.formatOpeningExplorer(data);
  assert.match(out, /avg 1700/);
});

test("formatOpeningExplorer reports an empty position", () => {
  const data: ExplorerResult = {
    white: 0,
    draws: 0,
    black: 0,
    moves: [],
  };
  const out = lichessTools.formatOpeningExplorer(data);
  assert.match(out, /No moves in this database/);
});
