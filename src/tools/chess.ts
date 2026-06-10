import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as api from "../chess-api.js";
import {
  jsonBlock,
  toISOString,
  truncated,
  text,
  errorResult,
  formatList,
} from "../format.js";

// All tools are read-only and talk to an external API.
const READ_ONLY_HINTS = { readOnlyHint: true, openWorldHint: true };

// Shared offset/limit inputs for tools that page client-side over a full list
// the upstream returns without server-side paging (#45). Spread into inputSchema.
const PAGE_PARAMS = {
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Number of items to skip for paging (default 0)"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe("Maximum number of items to return on this page"),
};

// ─── Formatters ────────────────────────────────────────────────────

export function formatProfile(p: api.PlayerProfile): string {
  const lines: string[] = [`Username: ${p.username}`, `URL: ${p.url}`];
  if (p.title) lines.push(`Title: ${p.title}`);
  if (p.name) lines.push(`Name: ${p.name}`);
  lines.push(`Status: ${p.status}`);
  if (p.fide) lines.push(`FIDE: ${p.fide}`);
  lines.push(`Followers: ${p.followers}`);
  lines.push(`Joined: ${toISOString(p.joined, "s")}`);
  lines.push(`Last Online: ${toISOString(p.last_online, "s")}`);
  if (p.location) lines.push(`Location: ${p.location}`);
  if (p.is_streamer) lines.push(`Streamer: yes`);
  if (p.twitch_url) lines.push(`Twitch: ${p.twitch_url}`);
  return lines.join("\n");
}

function formatPuzzle(data: api.DailyPuzzle): string {
  return [
    `Title: ${data.title}`,
    `URL: ${data.url}`,
    `Published: ${toISOString(data.publish_time, "s")}`,
    `FEN: ${data.fen}`,
    `PGN: ${data.pgn}`,
  ].join("\n");
}

const ONLINE_WINDOW_SECONDS = 300;

/**
 * Chess.com has no is-online endpoint; derive recency from the profile's
 * last_online (Unix seconds). Online = seen within the last 5 minutes.
 * `nowMs` is injectable for deterministic testing.
 */
export function formatOnlineStatus(
  username: string,
  lastOnline: number,
  nowMs: number = Date.now(),
): string {
  const online =
    Number.isFinite(lastOnline) &&
    nowMs / 1000 - lastOnline < ONLINE_WINDOW_SECONDS;
  if (online) return `${username} is online`;
  const seen = toISOString(lastOnline, "s");
  return seen === "unknown"
    ? `${username} is offline`
    : `${username} is offline (last online ${seen})`;
}

// Tournament responses inline the full player list — hundreds of entries for a
// big knockout — so cap it like get_club_members caps its member groups.
const TOURNAMENT_PLAYERS_CAP = 50;

export function formatTournament(d: api.TournamentProfile): string {
  const lines: string[] = [
    `Name: ${d.name}`,
    `URL: ${d.url}`,
    `Status: ${d.status}`,
    `Creator: ${d.creator}`,
  ];
  if (d.finish_time) lines.push(`Finished: ${toISOString(d.finish_time, "s")}`);
  if (d.description) lines.push(`Description: ${d.description}`);
  lines.push(`Settings: ${jsonBlock(d.settings)}`);
  const rounds = d.rounds ?? [];
  lines.push(`Rounds (${rounds.length}):`);
  for (const r of rounds) lines.push(`- ${r}`);
  const players = d.players ?? [];
  lines.push(`Players (${players.length}):`);
  lines.push(truncated(players, TOURNAMENT_PLAYERS_CAP, "players"));
  return lines.join("\n");
}

export function formatTournamentRound(d: api.TournamentRound): string {
  const groups = d.groups ?? [];
  const players = d.players ?? [];
  const lines: string[] = [`Groups (${groups.length}):`];
  for (const g of groups) lines.push(`- ${g}`);
  lines.push(`Players (${players.length}):`);
  lines.push(truncated(players, TOURNAMENT_PLAYERS_CAP, "players"));
  return lines.join("\n");
}

// ─── Error handler ─────────────────────────────────────────────────

export async function call<T>(fn: () => Promise<T>, format: (d: T) => string) {
  try {
    return text(format(await fn()));
  } catch (e) {
    // Catch every failure mode — typed API errors, network failures (TypeError
    // with cause), and invalid response bodies (SyntaxError) — and surface it as
    // a tagged tool error instead of an opaque, context-free throw.
    return errorResult("Chess.com", e);
  }
}

// ─── Tool registration ─────────────────────────────────────────────

export function registerChessTools(server: McpServer): void {
  // ── Player tools ──────────────────────────────────────────────────

  server.registerTool(
    "get_player_profile",
    {
      annotations: READ_ONLY_HINTS,
      title: "Get Player Profile",
      description:
        "Get a Chess.com player's profile information including username, title, status, FIDE rating, join date, and more.",
      inputSchema: {
        username: z.string().describe("Chess.com username"),
      },
    },
    ({ username }) => call(() => api.getPlayerProfile(username), formatProfile),
  );

  server.registerTool(
    "get_player_stats",
    {
      annotations: READ_ONLY_HINTS,
      title: "Get Player Stats",
      description:
        "Get a Chess.com player's ratings, win/loss/draw records, and other statistics across all game types (daily, rapid, blitz, bullet, tactics, puzzle rush, etc).",
      inputSchema: {
        username: z.string().describe("Chess.com username"),
      },
    },
    ({ username }) => call(() => api.getPlayerStats(username), jsonBlock),
  );

  server.registerTool(
    "is_player_online",
    {
      annotations: READ_ONLY_HINTS,
      title: "Is Player Online",
      description:
        "Check if a Chess.com player has been online in the last 5 minutes.",
      inputSchema: {
        username: z.string().describe("Chess.com username"),
      },
    },
    ({ username }) =>
      call(
        () => api.getPlayerProfile(username),
        (p) => formatOnlineStatus(username, p.last_online),
      ),
  );

  // ── Player games tools ────────────────────────────────────────────

  server.registerTool(
    "get_current_daily_games",
    {
      annotations: READ_ONLY_HINTS,
      title: "Get Current Daily Games",
      description: "Get the daily chess games a player is currently playing.",
      inputSchema: {
        username: z.string().describe("Chess.com username"),
      },
    },
    ({ username }) =>
      call(
        () => api.getCurrentDailyGames(username),
        (d) =>
          d.games.length === 0
            ? `${username} has no current daily games.`
            : jsonBlock(d.games),
      ),
  );

  server.registerTool(
    "get_games_to_move",
    {
      annotations: READ_ONLY_HINTS,
      title: "Get Games To Move",
      description:
        "Get daily chess games where it is the player's turn to move.",
      inputSchema: {
        username: z.string().describe("Chess.com username"),
      },
    },
    ({ username }) =>
      call(
        () => api.getGamesToMove(username),
        (d) =>
          d.games.length === 0
            ? `${username} has no games awaiting a move.`
            : jsonBlock(d.games),
      ),
  );

  server.registerTool(
    "get_game_archives",
    {
      annotations: READ_ONLY_HINTS,
      title: "Get Game Archives",
      description:
        "Get a list of monthly archive URLs available for a player. Each URL can be used to fetch the games for that month.",
      inputSchema: {
        username: z.string().describe("Chess.com username"),
      },
    },
    ({ username }) =>
      call(
        () => api.getGameArchives(username),
        (d) =>
          d.archives.length === 0
            ? `${username} has no game archives.`
            : `${username} has ${d.archives.length} monthly archives.\n\nMost recent archives:\n${d.archives.slice(-12).join("\n")}`,
      ),
  );

  server.registerTool(
    "get_monthly_archives",
    {
      annotations: READ_ONLY_HINTS,
      title: "Get Monthly Game Archive",
      description:
        "Get all games a player played in a specific month. Returns full game data including PGN, results, and ratings.",
      inputSchema: {
        username: z.string().describe("Chess.com username"),
        year: z
          .number()
          .int()
          .min(2007)
          .describe("Four-digit year (e.g. 2024)"),
        month: z.number().int().min(1).max(12).describe("Month number (1-12)"),
      },
    },
    ({ username, year, month }) => {
      const mm = String(month).padStart(2, "0");
      return call(
        () => api.getMonthlyArchive(username, year, month),
        (d) => {
          if (d.games.length === 0)
            return `${username} played no games in ${year}/${mm}.`;
          return `Found ${d.games.length} games for ${username} in ${year}/${mm}.\n\n${truncated(d.games, 10, "games")}`;
        },
      );
    },
  );

  server.registerTool(
    "get_monthly_archive_pgn",
    {
      annotations: READ_ONLY_HINTS,
      title: "Get Monthly Archive (PGN)",
      description:
        "Get all of a player's games for a specific month as a single PGN document — a convenience over get_monthly_archives' per-game JSON.",
      inputSchema: {
        username: z.string().describe("Chess.com username"),
        year: z
          .number()
          .int()
          .min(2007)
          .describe("Four-digit year (e.g. 2024)"),
        month: z.number().int().min(1).max(12).describe("Month number (1-12)"),
      },
    },
    ({ username, year, month }) => {
      const mm = String(month).padStart(2, "0");
      return call(
        () => api.getMonthlyArchivePgn(username, year, month),
        (pgn) => {
          const trimmed = pgn.trim();
          if (trimmed === "")
            return `${username} played no games in ${year}/${mm}.`;
          // Cap raw PGN so a busy month can't blow the context window.
          const max = 50_000;
          return trimmed.length <= max
            ? trimmed
            : trimmed.slice(0, max) +
                `\n… truncated (${trimmed.length - max} more characters not shown)`;
        },
      );
    },
  );

  // ── Player participation tools ──────────────────────────────────────

  server.registerTool(
    "get_player_clubs",
    {
      annotations: READ_ONLY_HINTS,
      title: "Get Player Clubs",
      description: "Get the list of clubs a player is a member of.",
      inputSchema: {
        username: z.string().describe("Chess.com username"),
      },
    },
    ({ username }) =>
      call(
        () => api.getPlayerClubs(username),
        (d) => jsonBlock(d.clubs),
      ),
  );

  server.registerTool(
    "get_player_tournaments",
    {
      annotations: READ_ONLY_HINTS,
      title: "Get Player Tournaments",
      description:
        "Get tournaments a player has participated in, is currently in, or is registered for.",
      inputSchema: {
        username: z.string().describe("Chess.com username"),
      },
    },
    ({ username }) =>
      call(
        () => api.getPlayerTournaments(username),
        (d) => {
          const summary = [
            `Finished: ${d.finished.length}`,
            `In progress: ${d.in_progress.length}`,
            `Registered: ${d.registered.length}`,
          ].join("\n");
          return `${summary}\n\n${jsonBlock(d)}`;
        },
      ),
  );

  server.registerTool(
    "get_player_matches",
    {
      annotations: READ_ONLY_HINTS,
      title: "Get Player Team Matches",
      description:
        "Get team matches a player has participated in, is currently in, or is registered for.",
      inputSchema: {
        username: z.string().describe("Chess.com username"),
      },
    },
    ({ username }) => call(() => api.getPlayerMatches(username), jsonBlock),
  );

  // ── Titled players tool ────────────────────────────────────────────

  server.registerTool(
    "get_titled_players",
    {
      annotations: READ_ONLY_HINTS,
      title: "Get Titled Players",
      description:
        "Get a list of usernames of players who hold a specific chess title. Valid titles: GM, WGM, IM, WIM, FM, WFM, NM, WNM, CM, WCM. Paginate with offset/limit.",
      inputSchema: {
        title: z
          .enum([
            "GM",
            "WGM",
            "IM",
            "WIM",
            "FM",
            "WFM",
            "NM",
            "WNM",
            "CM",
            "WCM",
          ])
          .describe("Chess title abbreviation"),
        ...PAGE_PARAMS,
      },
    },
    ({ title, offset, limit }) =>
      call(
        () => api.getTitledPlayers(title),
        (d) =>
          formatList(d.players, {
            offset: offset ?? 0,
            limit: limit ?? 50,
            label: "players",
            subject: `with title ${title}`,
          }),
      ),
  );

  // ── Club tools ─────────────────────────────────────────────────────

  server.registerTool(
    "get_club_profile",
    {
      annotations: READ_ONLY_HINTS,
      title: "Get Club Profile",
      description:
        "Get a Chess.com club's profile information. The url-ID is the slug from the club's web page URL.",
      inputSchema: {
        url_id: z
          .string()
          .describe(
            'Club URL ID / slug (e.g. "chess-com-developer-community")',
          ),
      },
    },
    ({ url_id }) =>
      call(
        () => api.getClubProfile(url_id),
        (d) =>
          [
            `Name: ${d.name}`,
            `Members: ${d.members_count}`,
            `Avg Daily Rating: ${d.average_daily_rating}`,
            `Visibility: ${d.visibility}`,
            `Created: ${toISOString(d.created, "s")}`,
            `Last Activity: ${toISOString(d.last_activity, "s")}`,
            `Description: ${d.description}`,
          ].join("\n"),
      ),
  );

  server.registerTool(
    "get_club_members",
    {
      annotations: READ_ONLY_HINTS,
      title: "Get Club Members",
      description:
        "Get a club's members grouped by activity level (weekly, monthly, all-time).",
      inputSchema: {
        url_id: z.string().describe("Club URL ID / slug"),
      },
    },
    ({ url_id }) =>
      call(
        () => api.getClubMembers(url_id),
        (d) => {
          const cap = 50;
          const summary = [
            `Weekly active: ${d.weekly.length}`,
            `Monthly active: ${d.monthly.length}`,
            `All-time: ${d.all_time.length}`,
          ].join("\n");
          // Show only a slice of each group — a large club's all_time list can be
          // tens of thousands of members; totals are already in the summary.
          const slim = {
            weekly: d.weekly.slice(0, cap),
            monthly: d.monthly.slice(0, cap),
            all_time: d.all_time.slice(0, cap),
          };
          return `${summary}\n\n${jsonBlock(slim)}`;
        },
      ),
  );

  server.registerTool(
    "get_club_matches",
    {
      annotations: READ_ONLY_HINTS,
      title: "Get Club Matches",
      description:
        "Get a club's team matches grouped by status (finished, in progress, registered).",
      inputSchema: {
        url_id: z.string().describe("Club URL ID / slug"),
      },
    },
    ({ url_id }) => call(() => api.getClubMatches(url_id), jsonBlock),
  );

  // ── Tournament tools ───────────────────────────────────────────────

  server.registerTool(
    "get_tournament",
    {
      annotations: READ_ONLY_HINTS,
      title: "Get Tournament",
      description:
        "Get details about a Chess.com tournament including settings, players, and round URLs.",
      inputSchema: {
        url_id: z
          .string()
          .describe(
            'Tournament URL ID / slug (e.g. "-33rd-chesscom-quick-knockouts-1401-1600")',
          ),
      },
    },
    ({ url_id }) =>
      call(() => api.getTournamentProfile(url_id), formatTournament),
  );

  server.registerTool(
    "get_tournament_round",
    {
      annotations: READ_ONLY_HINTS,
      title: "Get Tournament Round",
      description:
        "Get details about a specific round of a tournament, including groups and players.",
      inputSchema: {
        url_id: z.string().describe("Tournament URL ID / slug"),
        round: z.number().int().min(1).describe("Round number"),
      },
    },
    ({ url_id, round }) =>
      call(() => api.getTournamentRound(url_id, round), formatTournamentRound),
  );

  server.registerTool(
    "get_tournament_round_group",
    {
      annotations: READ_ONLY_HINTS,
      title: "Get Tournament Round Group",
      description:
        "Get details about a specific group within a tournament round, including games and standings.",
      inputSchema: {
        url_id: z.string().describe("Tournament URL ID / slug"),
        round: z.number().int().min(1).describe("Round number"),
        group: z.number().int().min(1).describe("Group number"),
      },
    },
    ({ url_id, round, group }) =>
      call(() => api.getTournamentRoundGroup(url_id, round, group), jsonBlock),
  );

  // ── Team match tools ───────────────────────────────────────────────

  server.registerTool(
    "get_team_match",
    {
      annotations: READ_ONLY_HINTS,
      title: "Get Team Match",
      description:
        "Get details about a daily team match including teams, players, and scores.",
      inputSchema: {
        match_id: z.number().int().describe("Team match ID (numeric)"),
      },
    },
    ({ match_id }) => call(() => api.getTeamMatch(match_id), jsonBlock),
  );

  server.registerTool(
    "get_team_match_board",
    {
      annotations: READ_ONLY_HINTS,
      title: "Get Team Match Board",
      description: "Get details about a specific board in a daily team match.",
      inputSchema: {
        match_id: z.number().int().describe("Team match ID (numeric)"),
        board: z.number().int().min(1).describe("Board number"),
      },
    },
    ({ match_id, board }) =>
      call(() => api.getTeamMatchBoard(match_id, board), jsonBlock),
  );

  server.registerTool(
    "get_live_team_match",
    {
      annotations: READ_ONLY_HINTS,
      title: "Get Live Team Match",
      description:
        "Get details about a live team match including teams, players, and scores.",
      inputSchema: {
        match_id: z.number().int().describe("Live team match ID (numeric)"),
      },
    },
    ({ match_id }) => call(() => api.getLiveTeamMatch(match_id), jsonBlock),
  );

  server.registerTool(
    "get_live_team_match_board",
    {
      annotations: READ_ONLY_HINTS,
      title: "Get Live Team Match Board",
      description: "Get details about a specific board in a live team match.",
      inputSchema: {
        match_id: z.number().int().describe("Live team match ID (numeric)"),
        board: z.number().int().min(1).describe("Board number"),
      },
    },
    ({ match_id, board }) =>
      call(() => api.getLiveTeamMatchBoard(match_id, board), jsonBlock),
  );

  // ── Country tools ──────────────────────────────────────────────────

  server.registerTool(
    "get_country_profile",
    {
      annotations: READ_ONLY_HINTS,
      title: "Get Country Profile",
      description:
        "Get profile information for a country on Chess.com using its 2-letter ISO 3166 code.",
      inputSchema: {
        iso_code: z
          .string()
          .length(2)
          .describe("2-letter ISO 3166 country code (e.g. US, GB, IN)"),
      },
    },
    ({ iso_code }) =>
      call(
        () => api.getCountryProfile(iso_code),
        (d) => `Country: ${d.name}\nCode: ${d.code}`,
      ),
  );

  server.registerTool(
    "get_country_players",
    {
      annotations: READ_ONLY_HINTS,
      title: "Get Country Players",
      description:
        "Get a list of player usernames from a specific country. Paginate with offset/limit.",
      inputSchema: {
        iso_code: z
          .string()
          .length(2)
          .describe("2-letter ISO 3166 country code"),
        ...PAGE_PARAMS,
      },
    },
    ({ iso_code, offset, limit }) =>
      call(
        () => api.getCountryPlayers(iso_code),
        (d) =>
          formatList(d.players, {
            offset: offset ?? 0,
            limit: limit ?? 100,
            label: "players",
            subject: `from ${iso_code.toUpperCase()}`,
          }),
      ),
  );

  server.registerTool(
    "get_country_clubs",
    {
      annotations: READ_ONLY_HINTS,
      title: "Get Country Clubs",
      description:
        "Get a list of club URLs from a specific country. Paginate with offset/limit.",
      inputSchema: {
        iso_code: z
          .string()
          .length(2)
          .describe("2-letter ISO 3166 country code"),
        ...PAGE_PARAMS,
      },
    },
    ({ iso_code, offset, limit }) =>
      call(
        () => api.getCountryClubs(iso_code),
        (d) =>
          formatList(d.clubs, {
            offset: offset ?? 0,
            limit: limit ?? 50,
            label: "clubs",
            join: "\n",
            subject: `from ${iso_code.toUpperCase()}`,
          }),
      ),
  );

  // ── Daily puzzle tools ─────────────────────────────────────────────

  server.registerTool(
    "get_daily_puzzle",
    {
      annotations: READ_ONLY_HINTS,
      title: "Get Daily Puzzle",
      description:
        "Get today's daily chess puzzle from Chess.com, including the FEN position and PGN solution.",
      inputSchema: {},
    },
    () => call(() => api.getDailyPuzzle(), formatPuzzle),
  );

  server.registerTool(
    "get_random_puzzle",
    {
      annotations: READ_ONLY_HINTS,
      title: "Get Random Puzzle",
      description:
        "Get a random daily chess puzzle from Chess.com, including the FEN position and PGN solution.",
      inputSchema: {},
    },
    () => call(() => api.getRandomPuzzle(), formatPuzzle),
  );

  // ── Streamers tool ─────────────────────────────────────────────────

  server.registerTool(
    "get_streamers",
    {
      annotations: READ_ONLY_HINTS,
      title: "Get Streamers",
      description: "Get a list of Chess.com streamers and their information.",
      inputSchema: {},
    },
    () =>
      call(
        () => api.getStreamers(),
        (d) => jsonBlock(d.streamers),
      ),
  );

  // ── Leaderboards tool ──────────────────────────────────────────────

  server.registerTool(
    "get_leaderboards",
    {
      annotations: READ_ONLY_HINTS,
      title: "Get Leaderboards",
      description:
        "Get Chess.com leaderboards for all game types (daily, rapid, blitz, bullet, etc.), tactics, and puzzle rush.",
      inputSchema: {},
    },
    () => call(() => api.getLeaderboards(), jsonBlock),
  );
}
