import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  LichessUser,
  PaginatedTeams,
  SwissInfo,
  ArenaTournament,
  TournamentTeamStandings,
} from "../src/lichess-api.js";
import type { PlayerProfile } from "../src/chess-api.js";
import * as lichessTools from "../src/tools/lichess.js";
import * as chessTools from "../src/tools/chess.js";

// ─── H2: formatters must tolerate trimmed/partial upstream payloads ──

test("formatUser still renders a normal account with ratings (happy-path guard)", () => {
  const user = {
    id: "u",
    username: "User",
    url: "https://lichess.org/@/User",
    createdAt: 0,
    seenAt: 0,
    count: { all: 10, rated: 5, draw: 1, loss: 2, win: 7, playing: 0 },
    perfs: { blitz: { games: 10, rating: 1500, rd: 50, prog: 5 } },
  } as unknown as LichessUser;

  const out = lichessTools.formatUser(user);
  assert.match(out, /User/);
  assert.match(out, /blitz/);
  assert.match(out, /1500/);
});

test("formatUser tolerates a disabled Lichess account (no count/perfs/timestamps)", () => {
  // Lichess returns disabled accounts as HTTP 200 with only id/username.
  const disabled = {
    id: "ghost",
    username: "ghost",
    disabled: true,
  } as unknown as LichessUser;

  let out = "";
  assert.doesNotThrow(() => {
    out = lichessTools.formatUser(disabled);
  });
  assert.match(out, /ghost/);
});

test("formatProfile tolerates a Chess.com profile with missing timestamps", () => {
  const partial = {
    username: "ghost",
    url: "https://www.chess.com/member/ghost",
    status: "closed:fair_play_violations",
    followers: 0,
  } as unknown as PlayerProfile;

  let out = "";
  assert.doesNotThrow(() => {
    out = chessTools.formatProfile(partial);
  });
  assert.match(out, /ghost/);
});

test("formatUser omits the URL line entirely when the account has no url", () => {
  const disabled = {
    id: "ghost",
    username: "ghost",
    disabled: true,
  } as unknown as LichessUser;

  const out = lichessTools.formatUser(disabled);
  assert.doesNotMatch(out, /URL:/);
});

// ─── #58: team listings (popular teams, swiss/arena tournaments) ────

test("formatPopularTeams lists teams with id, name, member count and page cursor", () => {
  const page = {
    currentPage: 2,
    nbPages: 50,
    currentPageResults: [
      { id: "coders", name: "Team Coders", nbMembers: 1234 },
      { id: "lichess-swiss", name: "Lichess Swiss", nbMembers: 99 },
    ],
  } as unknown as PaginatedTeams;

  const out = lichessTools.formatPopularTeams(page);
  assert.match(out, /Team Coders \(coders, 1234 members\)/);
  assert.match(out, /Lichess Swiss \(lichess-swiss, 99 members\)/);
  assert.match(out, /page 2\/50/);
});

test("formatPopularTeams returns a clear empty-state message", () => {
  const empty = { currentPageResults: [] } as unknown as PaginatedTeams;
  assert.match(lichessTools.formatPopularTeams(empty), /No teams found/);
});

test("formatPopularTeams tolerates a missing currentPageResults field", () => {
  let out = "";
  assert.doesNotThrow(() => {
    out = lichessTools.formatPopularTeams({} as PaginatedTeams);
  });
  assert.match(out, /No teams found/);
});

test("formatTeamSwiss lists swiss tournaments with id, name, status and date", () => {
  const swiss = [
    {
      id: "abc12345",
      name: "Weekly Swiss",
      status: "finished",
      startsAt: "2026-03-01T18:00:00.000Z",
      nbRounds: 8,
    },
  ] as unknown as SwissInfo[];

  const out = lichessTools.formatTeamSwiss(swiss);
  assert.match(out, /Weekly Swiss \(abc12345\)/);
  assert.match(out, /finished/);
  assert.match(out, /2026-03-01/);
  assert.match(out, /8 rounds/);
});

test("formatTeamSwiss returns a clear empty-state message", () => {
  assert.match(lichessTools.formatTeamSwiss([]), /no Swiss tournaments/i);
});

test("formatTeamArena maps the numeric status code to a label", () => {
  const arena = [
    {
      id: "xyz98765",
      fullName: "Spring Arena",
      status: 30,
      startsAt: "2026-04-01T12:00:00.000Z",
      nbPlayers: 42,
    },
  ] as unknown as ArenaTournament[];

  const out = lichessTools.formatTeamArena(arena);
  assert.match(out, /Spring Arena \(xyz98765\)/);
  assert.match(out, /finished/); // status 30 → "finished", not the raw number
  assert.doesNotMatch(out, /status 30/);
  assert.match(out, /42 players/);
});

test("formatTeamArena tolerates an unknown status code and an epoch startsAt", () => {
  const arena = [
    { id: "t1", fullName: "Odd Arena", status: 99, startsAt: 1735732800000 },
  ] as unknown as ArenaTournament[];

  let out = "";
  assert.doesNotThrow(() => {
    out = lichessTools.formatTeamArena(arena);
  });
  assert.match(out, /status 99/); // unknown code falls back to the raw value
  assert.match(out, /2025-01-01/); // epoch ms → ISO date
});

test("formatTeamArena returns a clear empty-state message", () => {
  assert.match(lichessTools.formatTeamArena([]), /no Arena tournaments/i);
});

// ─── #60: masters game PGN render ──────────────────────────────────

test("formatMastersGamePgn returns the PGN unchanged for a normal game", () => {
  const pgn = '[Event "Casual"]\n[White "A"]\n[Black "B"]\n\n1. e4 e5 1-0';
  assert.equal(lichessTools.formatMastersGamePgn(pgn), pgn);
});

test("formatMastersGamePgn reports a clear empty-state for a blank body", () => {
  assert.match(lichessTools.formatMastersGamePgn("   \n  "), /No PGN/i);
});

test("formatMastersGamePgn caps an oversized PGN with a truncation marker", () => {
  const huge = '[Event "x"]\n\n' + "1. e4 e5 ".repeat(20_000);
  const out = lichessTools.formatMastersGamePgn(huge);
  assert.ok(out.length < huge.length);
  assert.match(out, /truncated/);
});

// ─── #63: Swiss TRF export render ──────────────────────────────────

test("formatSwissTrf returns the TRF text unchanged for a normal export", () => {
  const trf = "012 My Swiss\n032 Lichess\n001    1 m  ... ";
  assert.equal(lichessTools.formatSwissTrf(trf), trf);
});

test("formatSwissTrf reports a clear empty-state for a blank body", () => {
  assert.match(lichessTools.formatSwissTrf("  \n "), /No TRF/i);
});

test("formatSwissTrf caps an oversized TRF with a truncation marker", () => {
  const huge = "001 " + "x".repeat(80_000);
  const out = lichessTools.formatSwissTrf(huge);
  assert.ok(out.length < huge.length);
  assert.match(out, /truncated/);
});

// ─── #62: team-battle standings ────────────────────────────────────

test("formatTournamentTeams ranks teams with scores and each team's top players", () => {
  const data = {
    id: "QQDJENHA",
    teams: [
      {
        rank: 1,
        id: "team-alpha",
        score: 37,
        players: [
          { user: { id: "drmelekess", name: "DrMelekess", title: "GM" }, score: 20 },
          { user: { id: "p2", name: "Player Two" }, score: 17 },
        ],
      },
      {
        rank: 2,
        id: "team-beta",
        score: 35,
        players: [{ user: { id: "p3", name: "Player Three" }, score: 35 }],
      },
    ],
  } as unknown as TournamentTeamStandings;

  const out = lichessTools.formatTournamentTeams(data);
  assert.match(out, /2 teams:/);
  assert.match(out, /1\. team-alpha — 37 pts/);
  assert.match(out, /GM DrMelekess/);
  assert.match(out, /2\. team-beta — 35 pts/);
});

test("formatTournamentTeams returns a clear message for a non-team-battle (null body)", () => {
  assert.match(
    lichessTools.formatTournamentTeams(null),
    /not a team battle/i,
  );
});

test("formatTournamentTeams treats an empty teams array as a non-team-battle", () => {
  const data = { id: "x", teams: [] } as unknown as TournamentTeamStandings;
  assert.match(lichessTools.formatTournamentTeams(data), /not a team battle/i);
});

test("formatTournamentTeams tolerates a missing player score and players array", () => {
  const data = {
    id: "x",
    teams: [
      { rank: 1, id: "t1", score: 10, players: [{ user: { id: "u", name: "U" } }] },
      { rank: 2, id: "t2", score: 8 },
    ],
  } as unknown as TournamentTeamStandings;
  let out = "";
  assert.doesNotThrow(() => {
    out = lichessTools.formatTournamentTeams(data);
  });
  assert.match(out, /1\. t1 — 10 pts/);
  assert.match(out, /2\. t2 — 8 pts/);
});

test("formatTournamentTeams caps a large team list", () => {
  const teams = Array.from({ length: 40 }, (_, i) => ({
    rank: i + 1,
    id: `team-${i}`,
    score: 100 - i,
    players: [],
  }));
  const data = { id: "x", teams } as unknown as TournamentTeamStandings;
  const out = lichessTools.formatTournamentTeams(data);
  assert.match(out, /40 teams:/);
  assert.match(out, /more teams not shown/);
});

// ─── formatUserStatuses (#82) ──────────────────────────────────────

test("formatUserStatuses renders one line per user with flags", () => {
  const out = lichessTools.formatUserStatuses([
    { id: "a", name: "Alice", title: "GM", online: true, playing: true },
    { id: "b", name: "Bob" },
  ]);
  assert.match(out, /GM Alice: online, playing/);
  assert.match(out, /Bob: offline/);
});

test("formatUserStatuses reports unknown usernames instead of empty text", () => {
  // Lichess answers unknown usernames with an empty array; the tool must not
  // return an empty content block.
  const out = lichessTools.formatUserStatuses([]);
  assert.notEqual(out, "");
  assert.match(out, /No matching users/);
});
