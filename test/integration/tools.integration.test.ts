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

// 76 in the default, token-less configuration: the OAuth-only
// lichess_get_user_teams (#30) is registered only when LICHESS_TOKEN is set,
// and the child server here is spawned without it.
test("tools/list exposes all 76 tools", { skip: !RUN }, async () => {
  const { tools } = await client.listTools();
  assert.equal(tools.length, 76);
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

// ─── #58: team listings (popular teams, swiss/arena tournaments) ────

test("lichess_get_popular_teams returns a page of teams", { skip: !RUN }, async () => {
  const { text, isError } = await callText("lichess_get_popular_teams", {});
  assert.equal(isError, false);
  // Each line carries an id + member count; the page always has results.
  assert.match(text, /members\)/);
});

test("lichess_get_team_swiss_tournaments lists a team's Swiss events", { skip: !RUN }, async () => {
  // 'coders' (thibault) runs a long-standing weekly Swiss series.
  const { text, isError } = await callText("lichess_get_team_swiss_tournaments", {
    team_id: "coders",
    max: 5,
  });
  assert.equal(isError, false);
  assert.match(text, /Swiss tournaments|no Swiss tournaments/);
});

test("lichess_get_team_arena_tournaments lists a team's Arena events", { skip: !RUN }, async () => {
  const { text, isError } = await callText("lichess_get_team_arena_tournaments", {
    team_id: "coders",
    max: 5,
  });
  assert.equal(isError, false);
  assert.match(text, /Arena tournaments|no Arena tournaments/);
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
});

// ─── v2: bulk endpoints (#43) + Chess.com monthly PGN (#47) ────────

test("lichess_export_games_by_ids returns the requested games as JSON", { skip: !RUN }, async () => {
  const { text, isError } = await callText("lichess_export_games_by_ids", {
    game_ids: ["kAdOQKeh"],
  });
  assert.equal(isError, false);
  assert.match(text, /Found \d+ games|No games found/);
});

test("lichess_export_games_by_ids returns PGN when format=pgn", { skip: !RUN }, async () => {
  const { text, isError } = await callText("lichess_export_games_by_ids", {
    game_ids: ["kAdOQKeh"],
    format: "pgn",
  });
  assert.equal(isError, false);
  assert.match(text, /\[Event /);
});

test("lichess_get_users fetches multiple users at once", { skip: !RUN }, async () => {
  const { text, isError } = await callText("lichess_get_users", {
    usernames: ["thibault", "neio"],
  });
  assert.equal(isError, false);
  assert.match(text, /Found 2 users/);
  assert.match(text, /thibault/);
});

test("get_monthly_archive_pgn returns a month of games as PGN", { skip: !RUN }, async () => {
  const { text, isError } = await callText("get_monthly_archive_pgn", {
    username: "erik",
    year: 2009,
    month: 10,
  });
  assert.equal(isError, false);
  assert.match(text, /\[Event |played no games/);
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

// ─── v2: Studies (#40) ─────────────────────────────────────────────

test("lichess_get_user_studies lists a user's public studies", { skip: !RUN }, async () => {
  const { text, isError } = await callText("lichess_get_user_studies", {
    username: "thibault",
  });
  assert.equal(isError, false);
  assert.match(text, /Found \d+ studies|No public studies/);
});

test("lichess_export_study_pgn returns the study as PGN", { skip: !RUN }, async () => {
  // Stable public study by thibault.
  const { text, isError } = await callText("lichess_export_study_pgn", {
    study_id: "1UmQwWtW",
  });
  assert.equal(isError, false);
  assert.match(text, /\[Event |\[White |\[Site /);
});

test("lichess_export_study_chapter_pgn surfaces a clean error for an invalid chapter", { skip: !RUN }, async () => {
  // Chapter IDs are not publicly enumerable; verify graceful error handling.
  const { isError } = await callText("lichess_export_study_chapter_pgn", {
    study_id: "1UmQwWtW",
    chapter_id: "zzzzzzzz",
  });
  assert.equal(isError, true);
});

// ─── v2: Broadcasts / live relays (#38) ────────────────────────────

test("lichess_get_broadcasts returns the broadcast index", { skip: !RUN }, async () => {
  const { text, isError } = await callText("lichess_get_broadcasts");
  assert.equal(isError, false);
  assert.match(text, /Found \d+ broadcasts|No broadcasts found/);
});

test("lichess_get_top_broadcasts returns featured broadcasts", { skip: !RUN }, async () => {
  const { text, isError } = await callText("lichess_get_top_broadcasts");
  assert.equal(isError, false);
  assert.match(text, /Active: \d+/);
});

test("lichess_get_broadcasts_by_user lists a creator's broadcasts", { skip: !RUN }, async () => {
  const { text, isError } = await callText("lichess_get_broadcasts_by_user", {
    username: "Lichess",
  });
  assert.equal(isError, false);
  assert.match(text, /broadcasts|No broadcasts/);
});

test("lichess_get_broadcast_round_pgn returns a round's PGN feed", { skip: !RUN }, async () => {
  // Finished round of the 3rd UzChess Cup 2026 broadcast; round data persists.
  const { text, isError } = await callText("lichess_get_broadcast_round_pgn", {
    round_id: "rQc8SLK6",
  });
  assert.equal(isError, false);
  assert.match(text, /\[Event |No PGN available/);
});

// ─── v2: Opening Explorer (#35) ────────────────────────────────────
// NOTE: explorer.lichess.ovh rate-limits/blocks datacenter (CI) IPs with HTTP
// 401, so these tolerate EITHER a real result OR a clean tagged error — they
// verify the tool wiring end-to-end without depending on a reachable host.

const STARTPOS = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

test("lichess_opening_explorer masters db returns totals or a tagged error", { skip: !RUN }, async () => {
  const { text, isError } = await callText("lichess_opening_explorer", {
    db: "masters",
    fen: STARTPOS,
    moves: 5,
  });
  if (isError) {
    assert.match(text, /Lichess error|request failed|timed out/i);
  } else {
    assert.match(text, /Total games:/);
  }
});

test("lichess_opening_explorer player db returns a repertoire or a tagged error", { skip: !RUN }, async () => {
  const { text, isError } = await callText("lichess_opening_explorer", {
    db: "player",
    fen: STARTPOS,
    player: "thibault",
    color: "white",
    moves: 5,
  });
  if (isError) {
    assert.match(text, /Lichess error|request failed|timed out/i);
  } else {
    assert.match(text, /Total games:/);
  }
});

// ─── v2: Tablebase (#36) ───────────────────────────────────────────

test("lichess_tablebase resolves a winning KQ vs K endgame", { skip: !RUN }, async () => {
  const { text, isError } = await callText("lichess_tablebase", {
    variant: "standard",
    fen: "4k3/8/8/8/8/8/8/4KQ2 w - - 0 1",
  });
  assert.equal(isError, false);
  assert.match(text, /Position: win/);
  assert.match(text, /DTZ/);
  assert.match(text, /Best moves/);
});

test("lichess_tablebase resolves a drawn KvK position", { skip: !RUN }, async () => {
  const { text, isError } = await callText("lichess_tablebase", {
    variant: "standard",
    fen: "4k3/8/8/8/8/8/8/4K3 w - - 0 1",
  });
  assert.equal(isError, false);
  assert.match(text, /Position: (draw|insufficient material)/);
});

// ─── v2: optional LICHESS_TOKEN / OAuth (#30) ──────────────────────
// Gated on a real token. The shared client above runs token-less (so the
// default tool list is deterministic); this spawns its own server child with
// LICHESS_TOKEN forwarded and verifies the OAuth-only tool then works live.
const LICHESS_TOKEN = process.env.LICHESS_TOKEN;

test(
  "lichess_get_user_teams works with a LICHESS_TOKEN (#30)",
  { skip: !RUN || !LICHESS_TOKEN },
  async () => {
    const tokenTransport = new StdioClientTransport({
      command: "node",
      args: ["dist/index.js"],
      env: {
        ...(process.env as Record<string, string>),
        LICHESS_TOKEN: LICHESS_TOKEN as string,
      },
    });
    const tokenClient = new Client({
      name: "integration-token",
      version: "1.0.0",
    });
    await tokenClient.connect(tokenTransport);
    try {
      const { tools } = await tokenClient.listTools();
      assert.equal(tools.length, 74);
      assert.ok(
        tools.find((t) => t.name === "lichess_get_user_teams"),
        "OAuth-only tool is registered when a token is present",
      );
      const res = await tokenClient.callTool({
        name: "lichess_get_user_teams",
        arguments: { username: "thibault" },
      });
      const content = (res.content ?? []) as Array<{
        type: string;
        text?: string;
      }>;
      const body = content
        .filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("\n");
      assert.equal(res.isError, false);
      assert.match(body, /Found \d+ teams|not a member of any teams/);
    } finally {
      await tokenClient.close();
    }
  },
);
