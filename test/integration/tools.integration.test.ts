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

test("tools/list exposes all 59 tools", { skip: !RUN }, async () => {
  const { tools } = await client.listTools();
  assert.equal(tools.length, 59);
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

// ─── v2: Swiss (#37) + Arena (#41) + Simuls (#42) ──────────────────

// Stable finished Swiss tournament (team 'coders', by thibault).
const SWISS_ID = "5M5GxDJm";

test("lichess_get_swiss returns tournament info", { skip: !RUN }, async () => {
  const { text, isError } = await callText("lichess_get_swiss", {
    swiss_id: SWISS_ID,
  });
  assert.equal(isError, false);
  assert.match(text, /Name:/);
  assert.match(text, /Rounds: \d+\/\d+/);
});

test("lichess_get_swiss_results returns standings", { skip: !RUN }, async () => {
  const { text, isError } = await callText("lichess_get_swiss_results", {
    swiss_id: SWISS_ID,
  });
  assert.equal(isError, false);
  assert.match(text, /players|No results/);
});

test("lichess_get_swiss_games returns PGN with format=pgn", { skip: !RUN }, async () => {
  const { text, isError } = await callText("lichess_get_swiss_games", {
    swiss_id: SWISS_ID,
    format: "pgn",
  });
  assert.equal(isError, false);
  assert.match(text, /\[Event |No games found/);
});

test("lichess_get_tournament_results returns arena standings", { skip: !RUN }, async () => {
  // Lichess keeps tournaments indefinitely, so this finished arena id stays valid.
  const { text, isError } = await callText("lichess_get_tournament_results", {
    tournament_id: "evAxzsSV",
  });
  assert.equal(isError, false);
  assert.match(text, /players|No results/);
});

test("lichess_get_tournament_games returns arena games as PGN", { skip: !RUN }, async () => {
  const { text, isError } = await callText("lichess_get_tournament_games", {
    tournament_id: "evAxzsSV",
    format: "pgn",
  });
  assert.equal(isError, false);
  assert.match(text, /\[Event |No games found/);
});

test("lichess_get_simuls returns the simul groups", { skip: !RUN }, async () => {
  const { text, isError } = await callText("lichess_get_simuls");
  assert.equal(isError, false);
  assert.match(text, /Started:|Created:|Finished:/);
});
