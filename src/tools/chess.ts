import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as api from "../chess-api.js";
import { jsonBlock, toISOString, truncated, text } from "../format.js";

// ─── Formatters ────────────────────────────────────────────────────

function formatProfile(p: api.PlayerProfile): string {
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

// ─── Error handler ─────────────────────────────────────────────────

async function call<T>(fn: () => Promise<T>, format: (d: T) => string) {
  try {
    return text(format(await fn()));
  } catch (e) {
    if (e instanceof api.ChessComApiError) {
      return text(`Chess.com error (${e.status}): ${e.message}`);
    }
    throw e;
  }
}

// ─── Tool registration ─────────────────────────────────────────────

export function registerChessTools(server: McpServer): void {
  // ── Player tools ──────────────────────────────────────────────────

  server.registerTool(
    "get_player_profile",
    {
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
      title: "Is Player Online",
      description:
        "Check if a Chess.com player has been online in the last 5 minutes.",
      inputSchema: {
        username: z.string().describe("Chess.com username"),
      },
    },
    ({ username }) =>
      call(
        () => api.getPlayerOnlineStatus(username),
        (s) => `${username} is ${s.online ? "online" : "offline"}`,
      ),
  );

  // ── Player games tools ────────────────────────────────────────────

  server.registerTool(
    "get_current_daily_games",
    {
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

  // ── Player participation tools ──────────────────────────────────────

  server.registerTool(
    "get_player_clubs",
    {
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
      title: "Get Titled Players",
      description:
        "Get a list of usernames of players who hold a specific chess title. Valid titles: GM, WGM, IM, WIM, FM, WFM, NM, WNM, CM, WCM.",
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
      },
    },
    ({ title }) =>
      call(
        () => api.getTitledPlayers(title),
        (d) =>
          `Found ${d.players.length} players with title ${title}.\n\nFirst 50: ${d.players.slice(0, 50).join(", ")}`,
      ),
  );

  // ── Club tools ─────────────────────────────────────────────────────

  server.registerTool(
    "get_club_profile",
    {
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
          const summary = [
            `Weekly active: ${d.weekly.length}`,
            `Monthly active: ${d.monthly.length}`,
            `All-time: ${d.all_time.length}`,
          ].join("\n");
          return `${summary}\n\n${jsonBlock(d)}`;
        },
      ),
  );

  server.registerTool(
    "get_club_matches",
    {
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
    ({ url_id }) => call(() => api.getTournamentProfile(url_id), jsonBlock),
  );

  server.registerTool(
    "get_tournament_round",
    {
      title: "Get Tournament Round",
      description:
        "Get details about a specific round of a tournament, including groups and players.",
      inputSchema: {
        url_id: z.string().describe("Tournament URL ID / slug"),
        round: z.number().int().min(1).describe("Round number"),
      },
    },
    ({ url_id, round }) =>
      call(() => api.getTournamentRound(url_id, round), jsonBlock),
  );

  server.registerTool(
    "get_tournament_round_group",
    {
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
      title: "Get Country Players",
      description: "Get a list of player usernames from a specific country.",
      inputSchema: {
        iso_code: z
          .string()
          .length(2)
          .describe("2-letter ISO 3166 country code"),
      },
    },
    ({ iso_code }) =>
      call(
        () => api.getCountryPlayers(iso_code),
        (d) => {
          const shown = d.players.slice(0, 100);
          const note =
            d.players.length > 100
              ? `\n… ${d.players.length - 100} more players not shown`
              : "";
          return `Found ${d.players.length} players from ${iso_code.toUpperCase()}.\n\n${shown.join(", ")}${note}`;
        },
      ),
  );

  server.registerTool(
    "get_country_clubs",
    {
      title: "Get Country Clubs",
      description: "Get a list of club URLs from a specific country.",
      inputSchema: {
        iso_code: z
          .string()
          .length(2)
          .describe("2-letter ISO 3166 country code"),
      },
    },
    ({ iso_code }) =>
      call(
        () => api.getCountryClubs(iso_code),
        (d) => {
          const shown = d.clubs.slice(0, 50);
          const note =
            d.clubs.length > 50
              ? `\n… ${d.clubs.length - 50} more clubs not shown`
              : "";
          return `Found ${d.clubs.length} clubs from ${iso_code.toUpperCase()}.\n\n${shown.join("\n")}${note}`;
        },
      ),
  );

  // ── Daily puzzle tools ─────────────────────────────────────────────

  server.registerTool(
    "get_daily_puzzle",
    {
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
      title: "Get Leaderboards",
      description:
        "Get Chess.com leaderboards for all game types (daily, rapid, blitz, bullet, etc.), tactics, and puzzle rush.",
      inputSchema: {},
    },
    () => call(() => api.getLeaderboards(), jsonBlock),
  );
}
