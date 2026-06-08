import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  BroadcastEntry,
  TopBroadcasts,
  BroadcastTournament,
  BroadcastRound,
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

// ─── formatBroadcastTournament (#59 — GET /api/broadcast/{id}) ──────

test("formatBroadcastTournament lists tour, rounds with status, and default round", () => {
  const data = {
    tour: {
      id: "7vwl29HB",
      name: "3rd UzChess Cup 2026",
      info: { format: "8-player round-robin", tc: "Rapid & Blitz", location: "Tashkent" },
    },
    rounds: [
      { id: "rQc8SLK6", name: "Round 1", finished: true, finishedAt: 1736500000000 },
      { id: "live22", name: "Round 2", ongoing: true },
      { id: "soon33", name: "Round 3", startsAt: 1736700000000 },
    ],
    defaultRoundId: "live22",
  } as unknown as BroadcastTournament;

  const out = lichessTools.formatBroadcastTournament(data);
  assert.match(out, /3rd UzChess Cup 2026/);
  assert.match(out, /7vwl29HB/);
  assert.match(out, /Rounds \(3\)/);
  assert.match(out, /Round 1 \(rQc8SLK6\).*finished/);
  assert.match(out, /Round 2 \(live22\).*live/);
  assert.match(out, /Round 3 \(soon33\).*starts/);
  assert.match(out, /8-player round-robin/);
  assert.match(out, /default round.*live22/i);
});

test("formatBroadcastTournament reports an empty round list", () => {
  const data = {
    tour: { id: "t", name: "Empty Cup" },
    rounds: [],
  } as unknown as BroadcastTournament;
  const out = lichessTools.formatBroadcastTournament(data);
  assert.match(out, /Empty Cup/);
  assert.match(out, /Rounds \(0\)|No rounds/i);
});

test("formatBroadcastTournament tolerates a tour with only id/name and no defaultRoundId", () => {
  const data = {
    tour: { id: "t", name: "Sparse Cup" },
    rounds: [{ id: "r1", name: "Round 1" }],
  } as unknown as BroadcastTournament;
  let out = "";
  assert.doesNotThrow(() => {
    out = lichessTools.formatBroadcastTournament(data);
  });
  assert.match(out, /Sparse Cup/);
  assert.doesNotMatch(out, /default round/i); // omitted when absent
});

// ─── formatBroadcastRound (#59 — GET /api/broadcast/-/-/{roundId}) ──

test("formatBroadcastRound shows the header and lists games with results", () => {
  const data = {
    tour: { id: "t", name: "FIDE Candidates 2024" },
    round: { id: "S4zisI6M", name: "Round 14", finished: true },
    games: [
      { id: "g1", name: "Gukesh D - Hikaru Nakamura", status: "1-0" },
      { id: "g2", name: "Fabiano Caruana - Nijat Abasov", status: "½-½" },
      { id: "g3", name: "Ian Nepomniachtchi - Vidit", status: "*" },
    ],
  } as unknown as BroadcastRound;

  const out = lichessTools.formatBroadcastRound(data);
  assert.match(out, /FIDE Candidates 2024/);
  assert.match(out, /Round 14/);
  assert.match(out, /Gukesh D - Hikaru Nakamura.*1-0/);
  assert.match(out, /½-½/);
  assert.match(out, /Ian Nepomniachtchi - Vidit.*ongoing/); // "*" → "ongoing"
});

test("formatBroadcastRound reports an empty game list", () => {
  const data = {
    tour: { id: "t", name: "Some Cup" },
    round: { id: "r", name: "Round 1" },
    games: [],
  } as unknown as BroadcastRound;
  assert.match(lichessTools.formatBroadcastRound(data), /No games/i);
});

// The cap is 30. Pin both sides of the boundary so an off-by-one (>= vs >, or a
// mis-sliced count) can't slip through — a far-past-the-cap test (e.g. 60) would
// pass for the buggy variant too.
const makeGames = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `g${i}`,
    name: `White ${i} - Black ${i}`,
    status: "*",
  }));

function roundWithGames(n: number): BroadcastRound {
  return {
    tour: { id: "t", name: "Big Open" },
    round: { id: "r", name: "Round 1" },
    games: makeGames(n),
  } as unknown as BroadcastRound;
}

const gameRows = (out: string) =>
  out.split("\n").filter((l) => l.startsWith("- ")).length;

test("formatBroadcastRound lists exactly the cap with no overflow note at the boundary (30)", () => {
  const out = lichessTools.formatBroadcastRound(roundWithGames(30));
  assert.match(out, /Games \(30\)/);
  assert.doesNotMatch(out, /more games not shown/);
  assert.equal(gameRows(out), 30);
});

test("formatBroadcastRound caps and reports the remainder one past the boundary (31)", () => {
  const out = lichessTools.formatBroadcastRound(roundWithGames(31));
  assert.match(out, /Games \(31\)/); // header shows the true total
  assert.match(out, /… 1 more games not shown/); // exact remainder
  assert.equal(gameRows(out), 30); // only the cap is listed
});

test("formatBroadcastRound caps a much larger game list", () => {
  const out = lichessTools.formatBroadcastRound(roundWithGames(60));
  assert.match(out, /… 30 more games not shown/);
  assert.equal(gameRows(out), 30);
});
