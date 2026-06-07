import { test } from "node:test";
import assert from "node:assert/strict";
import type { LichessUser } from "../src/lichess-api.js";
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
