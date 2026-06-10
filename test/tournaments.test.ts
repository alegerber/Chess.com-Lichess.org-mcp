import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  SwissInfo,
  StandingRow,
  Simul,
} from "../src/lichess-api.js";
import type { TournamentProfile, TournamentRound } from "../src/chess-api.js";
import * as lichessTools from "../src/tools/lichess.js";
import * as chessTools from "../src/tools/chess.js";

// ─── formatSwiss (#37) ─────────────────────────────────────────────

test("formatSwiss renders the key tournament fields", () => {
  const s: SwissInfo = {
    id: "5M5GxDJm",
    name: "Aronian",
    status: "finished",
    variant: "standard",
    round: 3,
    nbRounds: 3,
    nbPlayers: 4,
    clock: { limit: 180, increment: 0 },
    startsAt: "2020-05-09T03:07:00Z",
    createdBy: "thibault",
  };
  const out = lichessTools.formatSwiss(s);
  assert.match(out, /Name: Aronian/);
  assert.match(out, /ID: 5M5GxDJm/);
  assert.match(out, /Status: finished/);
  assert.match(out, /Rounds: 3\/3/);
  assert.match(out, /Players: 4/);
  assert.match(out, /Clock: 3\+0/);
});

test("formatSwiss tolerates missing clock/startsAt", () => {
  const s = {
    id: "x",
    name: "Bare",
    status: "created",
    variant: "standard",
    round: 0,
    nbRounds: 5,
    nbPlayers: 0,
  } as SwissInfo;
  let out = "";
  assert.doesNotThrow(() => {
    out = lichessTools.formatSwiss(s);
  });
  assert.match(out, /Name: Bare/);
  assert.doesNotMatch(out, /Clock:/);
});

// ─── formatStandings (#37 + #41 results) ───────────────────────────

test("formatStandings renders swiss rows with points and performance", () => {
  const rows: StandingRow[] = [
    { rank: 1, username: "Toadofsky", rating: 2131, points: 2, performance: 2260 },
    { rank: 2, username: "Sazed", rating: 2020, points: 1.5, performance: 1950 },
  ];
  const out = lichessTools.formatStandings(rows);
  assert.match(out, /2 players/);
  assert.match(out, /1\. Toadofsky \(2131\)/);
  assert.match(out, /2 pts/);
  assert.match(out, /perf 2260/);
});

test("formatStandings renders arena rows that use 'score' instead of 'points'", () => {
  const rows: StandingRow[] = [
    { rank: 1, username: "Blitzer", rating: 1500, score: 50, performance: 1600 },
  ];
  const out = lichessTools.formatStandings(rows);
  assert.match(out, /50 pts/);
});

test("formatStandings reports an empty result", () => {
  assert.match(lichessTools.formatStandings([]), /No results/);
});

// ─── formatSimuls (#42) ────────────────────────────────────────────

test("formatSimuls summarizes counts and lists active simuls", () => {
  const data = {
    pending: [] as Simul[],
    created: [] as Simul[],
    started: [
      {
        id: "Rn3xC1lt",
        name: "Class",
        fullName: "Class simul",
        host: { name: "shivayamanoj", id: "shivayamanoj" },
        nbApplicants: 5,
      },
    ] as Simul[],
    finished: [] as Simul[],
  };
  const out = lichessTools.formatSimuls(data);
  assert.match(out, /Started: 1/);
  assert.match(out, /Class simul by shivayamanoj/);
  assert.match(out, /5 applicants/);
});

test("formatSimuls reports when nothing is active", () => {
  const out = lichessTools.formatSimuls({
    pending: [],
    created: [],
    started: [],
    finished: [],
  });
  assert.match(out, /No active simuls/);
});

// ─── Chess.com tournament formatters ───────────────────────────────
// get_tournament / get_tournament_round used to dump the raw JSON, inlining
// multi-hundred-entry player lists; the formatters cap the players instead.

const makePlayers = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    username: `player${i}`,
    status: "eliminated",
  }));

test("formatTournament renders metadata, rounds, and a capped player list", () => {
  const d: TournamentProfile = {
    name: "Quick Knockouts",
    url: "https://www.chess.com/tournament/x",
    description: "A knockout tournament",
    creator: "erik",
    status: "finished",
    finish_time: 1389668157,
    settings: { time_class: "daily", rules: "chess" },
    players: makePlayers(51),
    rounds: ["https://api.chess.com/pub/tournament/x/1"],
  };
  const out = chessTools.formatTournament(d);
  assert.match(out, /Quick Knockouts/);
  assert.match(out, /Status: finished/);
  assert.match(out, /Finished: 2014-01-14/);
  assert.match(out, /time_class/); // settings survive
  assert.match(out, /Rounds \(1\)/);
  assert.match(out, /tournament\/x\/1/);
  assert.match(out, /Players \(51\)/); // header shows the true total
  assert.match(out, /… 1 more players not shown/); // exact remainder past the cap
  assert.match(out, /player0/);
  assert.doesNotMatch(out, /player50/); // the 51st entry is never inlined
});

test("formatTournament tolerates missing finish_time and empty lists", () => {
  const d = {
    name: "Bare",
    url: "https://www.chess.com/tournament/bare",
    description: "",
    creator: "c",
    status: "in_progress",
    settings: {},
    players: [],
    rounds: [],
  } as TournamentProfile;
  const out = chessTools.formatTournament(d);
  assert.match(out, /Players \(0\)/);
  assert.doesNotMatch(out, /Finished:/);
});

test("formatTournamentRound lists group URLs and caps the player list", () => {
  const d: TournamentRound = {
    groups: ["https://api.chess.com/pub/tournament/x/1/1"],
    players: makePlayers(51),
  };
  const out = chessTools.formatTournamentRound(d);
  assert.match(out, /Groups \(1\)/);
  assert.match(out, /tournament\/x\/1\/1/);
  assert.match(out, /Players \(51\)/);
  assert.match(out, /… 1 more players not shown/);
});
