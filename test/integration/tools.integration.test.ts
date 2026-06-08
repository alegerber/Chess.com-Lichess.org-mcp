import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * End-to-end integration tests, automating .context/uat-plan.md.
 *
 * These drive the *built* server (dist/index.js) over real stdio + the MCP
 * protocol and hit the live Chess.com / Lichess APIs, so they are non-
 * deterministic and network-dependent. They run only when RUN_INTEGRATION=1
 * (see `npm run test:integration`) and assert structural invariants — never
 * volatile values like ratings or online status.
 *
 * Prerequisite: `npm run build` (so dist/index.js exists).
 */

const RUN = process.env.RUN_INTEGRATION === "1";

let client: Client;
let transport: StdioClientTransport;

before(async () => {
  if (!RUN) return;
  transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
  });
  client = new Client({ name: "integration-test", version: "1.0.0" });
  await client.connect(transport);
});

after(async () => {
  if (!RUN) return;
  await client.close();
});

async function callText(
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ text: string; isError: boolean }> {
  const res = await client.callTool({ name, arguments: args });
  const content = (res.content ?? []) as Array<{
    type: string;
    text?: string;
  }>;
  const text = content
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n");
  return { text, isError: res.isError === true };
}

// ─── Protocol ──────────────────────────────────────────────────────

test("tools/list exposes all 56 tools", { skip: !RUN }, async () => {
  const { tools } = await client.listTools();
  assert.equal(tools.length, 56);
});

test("flags input that violates the Zod schema", { skip: !RUN }, async () => {
  // get_titled_players only accepts a fixed enum of titles; the SDK validates
  // the schema and returns a tagged error (before any API call).
  const { text, isError } = await callText("get_titled_players", {
    title: "NOPE",
  });
  assert.equal(isError, true);
  assert.match(text, /invalid|validation/i);
});

// ─── Chess.com (UAT §1–§3, §7) ─────────────────────────────────────

test("UAT 1.1 get_player_profile returns a profile", { skip: !RUN }, async () => {
  const { text, isError } = await callText("get_player_profile", {
    username: "hikaru",
  });
  assert.equal(isError, false);
  assert.match(text, /Username:/i);
});

test("UAT 1.4 get_player_profile flags an unknown user", { skip: !RUN }, async () => {
  const { text, isError } = await callText("get_player_profile", {
    username: "xyznonexistent999zzz",
  });
  assert.equal(isError, true);
  assert.match(text, /error|not found/i);
});

test("UAT 1.3 is_player_online reports online/offline (not a 404)", { skip: !RUN }, async () => {
  const { text, isError } = await callText("is_player_online", {
    username: "hikaru",
  });
  assert.equal(isError, false);
  assert.match(text, /is (online|offline)/i);
});

test("UAT 2.3 get_daily_puzzle returns a position", { skip: !RUN }, async () => {
  const { text, isError } = await callText("get_daily_puzzle");
  assert.equal(isError, false);
  assert.match(text, /FEN:/);
});

test("UAT 2.1 get_game_archives lists archives", { skip: !RUN }, async () => {
  const { text, isError } = await callText("get_game_archives", {
    username: "hikaru",
  });
  assert.equal(isError, false);
  assert.match(text, /archive/i);
});

test("UAT 3.3 get_titled_players returns GMs", { skip: !RUN }, async () => {
  const { text, isError } = await callText("get_titled_players", {
    title: "GM",
  });
  assert.equal(isError, false);
  assert.match(text, /GM/);
});

// ─── Lichess (UAT §4–§7) ───────────────────────────────────────────

test("UAT 4.1 lichess_get_user returns a profile", { skip: !RUN }, async () => {
  const { text, isError } = await callText("lichess_get_user", {
    username: "DrNykterstein",
  });
  assert.equal(isError, false);
  assert.match(text, /Username:/i);
});

test("lichess_get_user formats a disabled account without crashing", { skip: !RUN }, async () => {
  // Closed/disabled accounts return HTTP 200 without count/perfs (#12 fix).
  const { text, isError } = await callText("lichess_get_user", {
    username: "zzzzzzzzzzzz",
  });
  assert.equal(isError, false);
  assert.match(text, /Username:/i);
});

test("UAT 5.2 lichess_get_daily_puzzle returns a puzzle", { skip: !RUN }, async () => {
  const { text, isError } = await callText("lichess_get_daily_puzzle");
  assert.equal(isError, false);
  assert.match(text, /Puzzle ID:/i);
});

test("UAT 6.3 lichess_get_tv_channels returns content", { skip: !RUN }, async () => {
  const { text, isError } = await callText("lichess_get_tv_channels");
  assert.equal(isError, false);
  assert.ok(text.length > 0);
});

test("UAT 7.2 lichess_get_leaderboard returns top players", { skip: !RUN }, async () => {
  const { text, isError } = await callText("lichess_get_leaderboard", {
    nb: 10,
    perf_type: "bullet",
  });
  assert.equal(isError, false);
  assert.ok(text.length > 0);
});

// ─── Reliability (UAT §8): NDJSON streaming stays bounded (#14) ─────

test("lichess_get_team_members returns a bounded result for a large team", { skip: !RUN }, async () => {
  const { text, isError } = await callText("lichess_get_team_members", {
    team_id: "coders",
  });
  assert.equal(isError, false);
  // Streaming cap (200) + display cap keep this well under the jsonBlock backstop.
  assert.ok(
    text.length < 100_000,
    `expected a bounded result, got ${text.length} chars`,
  );
});

// ─── API completeness (#17) ────────────────────────────────────────

test("UAT 5.1 lichess_get_user_games honours max/since filters", { skip: !RUN }, async () => {
  const { text, isError } = await callText("lichess_get_user_games", {
    username: "DrNykterstein",
    max: 2,
    since: 1356998400000, // 2013-01-01
  });
  assert.equal(isError, false);
  assert.match(text, /Found \d+ games|No games found/);
});

test("UAT 5.4 lichess_get_crosstable returns a head-to-head record", { skip: !RUN }, async () => {
  const { text, isError } = await callText("lichess_get_crosstable", {
    user1: "DrNykterstein",
    user2: "penguingim1",
  });
  assert.equal(isError, false);
  assert.match(text, /Total games:/);
});

// ─── v2: FIDE players (#39) + autocomplete (#44) ───────────────────

test("lichess_get_fide_player returns a FIDE profile by id", { skip: !RUN }, async () => {
  const { text, isError } = await callText("lichess_get_fide_player", {
    player_id: 1503014, // Magnus Carlsen — stable FIDE ID
  });
  assert.equal(isError, false);
  assert.match(text, /FIDE ID: 1503014/);
  assert.match(text, /Name: Carlsen/);
});

test("lichess_search_fide_players finds players by name", { skip: !RUN }, async () => {
  const { text, isError } = await callText("lichess_search_fide_players", {
    query: "Carlsen",
  });
  assert.equal(isError, false);
  assert.match(text, /Found \d+ FIDE players|No FIDE players found/);
});

test("lichess_autocomplete_players resolves a partial username", { skip: !RUN }, async () => {
  const { text, isError } = await callText("lichess_autocomplete_players", {
    term: "magnus",
  });
  assert.equal(isError, false);
  assert.match(text, /matching players|No matching players/);
// ─── v2: PGN output option (#46) ───────────────────────────────────

test("lichess_get_user_games format=pgn returns raw PGN", { skip: !RUN }, async () => {
  const { text, isError } = await callText("lichess_get_user_games", {
    username: "DrNykterstein",
    max: 1,
    format: "pgn",
  });
  assert.equal(isError, false);
  // Raw PGN starts with a tag pair, never a JSON brace.
  assert.match(text, /\[Event |No games found/);
  assert.doesNotMatch(text, /Found \d+ games/);
});

test("lichess_get_game format=pgn returns raw PGN for a game id", { skip: !RUN }, async () => {
  // Stable historical game; PGN export is deterministic.
  const { text, isError } = await callText("lichess_get_game", {
    game_id: "kAdOQKeh",
    format: "pgn",
  });
  assert.equal(isError, false);
  assert.match(text, /\[Event /);
  assert.match(text, /\[Site "https:\/\/lichess\.org\/kAdOQKeh"\]/);
});

// ─── v2: pagination for hard-truncating Chess.com tools (#45) ──────

test("get_titled_players paginates with offset/limit", { skip: !RUN }, async () => {
  const { text, isError } = await callText("get_titled_players", {
    title: "GM",
    offset: 5,
    limit: 5,
  });
  assert.equal(isError, false);
  // There are far more than 10 GMs, so the second page is full and has a next hint.
  assert.match(text, /Showing 6–10 of \d+/);
  assert.match(text, /offset=10/);
});
