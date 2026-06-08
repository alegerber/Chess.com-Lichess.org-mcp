import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  BroadcastEntry,
  TopBroadcasts,
} from "../src/lichess-api.js";
import * as lichessTools from "../src/tools/lichess.js";

// ─── formatBroadcasts (#38 — index + by-user) ──────────────────────

test("formatBroadcasts lists tournaments with round count and default round", () => {
  const items: BroadcastEntry[] = [
    {
      tour: { id: "7vwl29HB", name: "3rd UzChess Cup 2026" },
      rounds: [
        { id: "rQc8SLK6", name: "Round 1" },
        { id: "x2", name: "Round 2" },
      ],
      defaultRoundId: "rQc8SLK6",
    },
  ];
  const out = lichessTools.formatBroadcasts(items);
  assert.match(out, /Found 1 broadcasts/);
  assert.match(out, /3rd UzChess Cup 2026/);
  assert.match(out, /2 rounds/);
  assert.match(out, /rQc8SLK6/);
});

test("formatBroadcasts reports an empty list", () => {
  assert.match(lichessTools.formatBroadcasts([]), /No broadcasts found/);
});

// ─── formatTopBroadcasts (#38 — /top) ──────────────────────────────

test("formatTopBroadcasts summarizes counts and lists active broadcasts", () => {
  const data: TopBroadcasts = {
    active: [
      { tour: { id: "a", name: "French Club Champ" }, round: { id: "r", name: "Round 5" } },
    ],
    upcoming: [],
    past: [
      { tour: { id: "p", name: "Old Event" } },
      { tour: { id: "p2", name: "Older Event" } },
    ],
  };
  const out = lichessTools.formatTopBroadcasts(data);
  assert.match(out, /Active: 1/);
  assert.match(out, /Past: 2/);
  assert.match(out, /French Club Champ/);
  assert.match(out, /Round 5/);
});

test("formatTopBroadcasts handles no active broadcasts", () => {
  const out = lichessTools.formatTopBroadcasts({
    active: [],
    upcoming: [],
    past: [],
  });
  assert.match(out, /Active: 0/);
});
