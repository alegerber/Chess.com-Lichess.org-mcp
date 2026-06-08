import { test } from "node:test";
import assert from "node:assert/strict";
import type { LichessUser } from "../src/lichess-api.js";
import * as lichessTools from "../src/tools/lichess.js";

// ─── formatUsersBulk (#43 — POST /api/users) ───────────────────────

test("formatUsersBulk renders one compact line per user with ratings", () => {
  const users = [
    {
      id: "drnykterstein",
      username: "DrNykterstein",
      title: "GM",
      count: { all: 5000, rated: 4000, draw: 100, loss: 900, win: 4000, playing: 0 },
      perfs: {
        bullet: { games: 100, rating: 3000, rd: 50, prog: 1 },
        blitz: { games: 200, rating: 2900, rd: 50, prog: 1 },
      },
    },
    { id: "ghost", username: "ghost" },
  ] as unknown as LichessUser[];

  const out = lichessTools.formatUsersBulk(users);
  assert.match(out, /Found 2 users/);
  assert.match(out, /GM DrNykterstein/);
  assert.match(out, /bullet 3000/);
  assert.match(out, /blitz 2900/);
  assert.match(out, /5000 games/);
  // The minimal account must still appear and not crash.
  assert.match(out, /ghost/);
});

test("formatUsersBulk reports an empty result", () => {
  assert.match(lichessTools.formatUsersBulk([]), /No users found/);
});
