import { test } from "node:test";
import assert from "node:assert/strict";
import type { LichessTeam } from "../src/lichess-api.js";
import * as lichess from "../src/lichess-api.js";
import * as lichessTools from "../src/tools/lichess.js";

// ─── Optional LICHESS_TOKEN / OAuth support (#30) ──────────────────

/** Run fn with LICHESS_TOKEN set to a value (or cleared), then restore it. */
function withToken(token: string | undefined, fn: () => void): void {
  const prev = process.env.LICHESS_TOKEN;
  if (token === undefined) delete process.env.LICHESS_TOKEN;
  else process.env.LICHESS_TOKEN = token;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.LICHESS_TOKEN;
    else process.env.LICHESS_TOKEN = prev;
  }
}

test("hasLichessToken reflects whether LICHESS_TOKEN is set", () => {
  withToken(undefined, () => assert.equal(lichess.hasLichessToken(), false));
  // A blank/whitespace value counts as unset, not a real token.
  withToken("   ", () => assert.equal(lichess.hasLichessToken(), false));
  withToken("lip_abc123", () => assert.equal(lichess.hasLichessToken(), true));
});

test("lichessAuthHeader sends a Bearer header only when a token is set", () => {
  withToken(undefined, () => assert.deepEqual(lichess.lichessAuthHeader(), {}));
  withToken("lip_abc123", () =>
    assert.deepEqual(lichess.lichessAuthHeader(), {
      Authorization: "Bearer lip_abc123",
    }),
  );
});

test("lichessAuthHeader trims surrounding whitespace from the token", () => {
  withToken("  lip_abc123  ", () =>
    assert.deepEqual(lichess.lichessAuthHeader(), {
      Authorization: "Bearer lip_abc123",
    }),
  );
});

test("formatUserTeams lists teams with id and member count", () => {
  const teams: LichessTeam[] = [
    {
      id: "coders",
      name: "Lichess Coders",
      description: "",
      open: true,
      leader: { id: "a", name: "A" },
      leaders: [],
      nbMembers: 1234,
    },
  ];
  const out = lichessTools.formatUserTeams(teams);
  assert.match(out, /Found 1 teams/);
  assert.match(out, /Lichess Coders \(coders, 1234 members\)/);
});

test("formatUserTeams handles a user with no teams", () => {
  const out = lichessTools.formatUserTeams([]);
  assert.match(out, /not a member of any teams/i);
});
