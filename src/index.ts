#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as api from "./chess-api.js";
import * as lichess from "./lichess-api.js";

const server = new McpServer({
  name: "chess-com-lichess-org-mcp",
  version: "1.0.0",
});

// ─── Helper ────────────────────────────────────────────────────────

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toISOString();
}

function formatProfile(p: api.PlayerProfile): string {
  const lines: string[] = [`Username: ${p.username}`, `URL: ${p.url}`];
  if (p.title) lines.push(`Title: ${p.title}`);
  if (p.name) lines.push(`Name: ${p.name}`);
  lines.push(`Status: ${p.status}`);
  if (p.fide) lines.push(`FIDE: ${p.fide}`);
  lines.push(`Followers: ${p.followers}`);
  lines.push(`Joined: ${formatTimestamp(p.joined)}`);
  lines.push(`Last Online: ${formatTimestamp(p.last_online)}`);
  if (p.location) lines.push(`Location: ${p.location}`);
  if (p.is_streamer) lines.push(`Streamer: yes`);
  if (p.twitch_url) lines.push(`Twitch: ${p.twitch_url}`);
  return lines.join("\n");
}

function jsonBlock(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

// ─── Player tools ──────────────────────────────────────────────────

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
  async ({ username }) => {
    const profile = await api.getPlayerProfile(username);
    return {
      content: [{ type: "text", text: formatProfile(profile) }],
    };
  },
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
  async ({ username }) => {
    const stats = await api.getPlayerStats(username);
    return {
      content: [{ type: "text", text: jsonBlock(stats) }],
    };
  },
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
  async ({ username }) => {
    const status = await api.getPlayerOnlineStatus(username);
    return {
      content: [
        {
          type: "text",
          text: `${username} is ${status.online ? "online" : "offline"}`,
        },
      ],
    };
  },
);

// ─── Player games tools ────────────────────────────────────────────

server.registerTool(
  "get_current_daily_games",
  {
    title: "Get Current Daily Games",
    description: "Get the daily chess games a player is currently playing.",
    inputSchema: {
      username: z.string().describe("Chess.com username"),
    },
  },
  async ({ username }) => {
    const data = await api.getCurrentDailyGames(username);
    return {
      content: [
        {
          type: "text",
          text:
            data.games.length === 0
              ? `${username} has no current daily games.`
              : jsonBlock(data.games),
        },
      ],
    };
  },
);

server.registerTool(
  "get_games_to_move",
  {
    title: "Get Games To Move",
    description: "Get daily chess games where it is the player's turn to move.",
    inputSchema: {
      username: z.string().describe("Chess.com username"),
    },
  },
  async ({ username }) => {
    const data = await api.getGamesToMove(username);
    return {
      content: [
        {
          type: "text",
          text:
            data.games.length === 0
              ? `${username} has no games awaiting a move.`
              : jsonBlock(data.games),
        },
      ],
    };
  },
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
  async ({ username }) => {
    const data = await api.getGameArchives(username);
    return {
      content: [
        {
          type: "text",
          text:
            data.archives.length === 0
              ? `${username} has no game archives.`
              : `${username} has ${data.archives.length} monthly archives.\n\nMost recent archives:\n${data.archives.slice(-12).join("\n")}`,
        },
      ],
    };
  },
);

server.registerTool(
  "get_monthly_archives",
  {
    title: "Get Monthly Game Archive",
    description:
      "Get all games a player played in a specific month. Returns full game data including PGN, results, and ratings.",
    inputSchema: {
      username: z.string().describe("Chess.com username"),
      year: z.number().int().min(2007).describe("Four-digit year (e.g. 2024)"),
      month: z.number().int().min(1).max(12).describe("Month number (1-12)"),
    },
  },
  async ({ username, year, month }) => {
    const data = await api.getMonthlyArchive(username, year, month);
    return {
      content: [
        {
          type: "text",
          text:
            data.games.length === 0
              ? `${username} played no games in ${year}/${String(month).padStart(2, "0")}.`
              : `Found ${data.games.length} games for ${username} in ${year}/${String(month).padStart(2, "0")}.\n\n${jsonBlock(data.games)}`,
        },
      ],
    };
  },
);

// ─── Player participation tools ────────────────────────────────────

server.registerTool(
  "get_player_clubs",
  {
    title: "Get Player Clubs",
    description: "Get the list of clubs a player is a member of.",
    inputSchema: {
      username: z.string().describe("Chess.com username"),
    },
  },
  async ({ username }) => {
    const data = await api.getPlayerClubs(username);
    return {
      content: [{ type: "text", text: jsonBlock(data.clubs) }],
    };
  },
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
  async ({ username }) => {
    const data = await api.getPlayerTournaments(username);
    const summary = [
      `Finished: ${data.finished.length}`,
      `In progress: ${data.in_progress.length}`,
      `Registered: ${data.registered.length}`,
    ].join("\n");
    return {
      content: [
        {
          type: "text",
          text: `${summary}\n\n${jsonBlock(data)}`,
        },
      ],
    };
  },
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
  async ({ username }) => {
    const data = await api.getPlayerMatches(username);
    return {
      content: [{ type: "text", text: jsonBlock(data) }],
    };
  },
);

// ─── Titled players tool ───────────────────────────────────────────

server.registerTool(
  "get_titled_players",
  {
    title: "Get Titled Players",
    description:
      "Get a list of usernames of players who hold a specific chess title. Valid titles: GM, WGM, IM, WIM, FM, WFM, NM, WNM, CM, WCM.",
    inputSchema: {
      title: z
        .enum(["GM", "WGM", "IM", "WIM", "FM", "WFM", "NM", "WNM", "CM", "WCM"])
        .describe("Chess title abbreviation"),
    },
  },
  async ({ title }) => {
    const data = await api.getTitledPlayers(title);
    return {
      content: [
        {
          type: "text",
          text: `Found ${data.players.length} players with title ${title}.\n\nFirst 50: ${data.players.slice(0, 50).join(", ")}`,
        },
      ],
    };
  },
);

// ─── Club tools ────────────────────────────────────────────────────

server.registerTool(
  "get_club_profile",
  {
    title: "Get Club Profile",
    description:
      "Get a Chess.com club's profile information. The url-ID is the slug from the club's web page URL.",
    inputSchema: {
      url_id: z
        .string()
        .describe('Club URL ID / slug (e.g. "chess-com-developer-community")'),
    },
  },
  async ({ url_id }) => {
    const data = await api.getClubProfile(url_id);
    const lines = [
      `Name: ${data.name}`,
      `Members: ${data.members_count}`,
      `Avg Daily Rating: ${data.average_daily_rating}`,
      `Visibility: ${data.visibility}`,
      `Created: ${formatTimestamp(data.created)}`,
      `Last Activity: ${formatTimestamp(data.last_activity)}`,
      `Description: ${data.description}`,
    ];
    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  },
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
  async ({ url_id }) => {
    const data = await api.getClubMembers(url_id);
    const summary = [
      `Weekly active: ${data.weekly.length}`,
      `Monthly active: ${data.monthly.length}`,
      `All-time: ${data.all_time.length}`,
    ].join("\n");
    return {
      content: [{ type: "text", text: `${summary}\n\n${jsonBlock(data)}` }],
    };
  },
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
  async ({ url_id }) => {
    const data = await api.getClubMatches(url_id);
    return {
      content: [{ type: "text", text: jsonBlock(data) }],
    };
  },
);

// ─── Tournament tools ──────────────────────────────────────────────

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
  async ({ url_id }) => {
    const data = await api.getTournamentProfile(url_id);
    return {
      content: [{ type: "text", text: jsonBlock(data) }],
    };
  },
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
  async ({ url_id, round }) => {
    const data = await api.getTournamentRound(url_id, round);
    return {
      content: [{ type: "text", text: jsonBlock(data) }],
    };
  },
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
  async ({ url_id, round, group }) => {
    const data = await api.getTournamentRoundGroup(url_id, round, group);
    return {
      content: [{ type: "text", text: jsonBlock(data) }],
    };
  },
);

// ─── Team match tools ──────────────────────────────────────────────

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
  async ({ match_id }) => {
    const data = await api.getTeamMatch(match_id);
    return {
      content: [{ type: "text", text: jsonBlock(data) }],
    };
  },
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
  async ({ match_id, board }) => {
    const data = await api.getTeamMatchBoard(match_id, board);
    return {
      content: [{ type: "text", text: jsonBlock(data) }],
    };
  },
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
  async ({ match_id }) => {
    const data = await api.getLiveTeamMatch(match_id);
    return {
      content: [{ type: "text", text: jsonBlock(data) }],
    };
  },
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
  async ({ match_id, board }) => {
    const data = await api.getLiveTeamMatchBoard(match_id, board);
    return {
      content: [{ type: "text", text: jsonBlock(data) }],
    };
  },
);

// ─── Country tools ─────────────────────────────────────────────────

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
  async ({ iso_code }) => {
    const data = await api.getCountryProfile(iso_code);
    return {
      content: [
        {
          type: "text",
          text: `Country: ${data.name}\nCode: ${data.code}`,
        },
      ],
    };
  },
);

server.registerTool(
  "get_country_players",
  {
    title: "Get Country Players",
    description: "Get a list of player usernames from a specific country.",
    inputSchema: {
      iso_code: z.string().length(2).describe("2-letter ISO 3166 country code"),
    },
  },
  async ({ iso_code }) => {
    const data = await api.getCountryPlayers(iso_code);
    return {
      content: [
        {
          type: "text",
          text: `Found ${data.players.length} players from ${iso_code.toUpperCase()}.\n\nFirst 100: ${data.players.slice(0, 100).join(", ")}`,
        },
      ],
    };
  },
);

server.registerTool(
  "get_country_clubs",
  {
    title: "Get Country Clubs",
    description: "Get a list of club URLs from a specific country.",
    inputSchema: {
      iso_code: z.string().length(2).describe("2-letter ISO 3166 country code"),
    },
  },
  async ({ iso_code }) => {
    const data = await api.getCountryClubs(iso_code);
    return {
      content: [
        {
          type: "text",
          text: `Found ${data.clubs.length} clubs from ${iso_code.toUpperCase()}.\n\n${data.clubs.slice(0, 50).join("\n")}`,
        },
      ],
    };
  },
);

// ─── Daily puzzle tools ────────────────────────────────────────────

server.registerTool(
  "get_daily_puzzle",
  {
    title: "Get Daily Puzzle",
    description:
      "Get today's daily chess puzzle from Chess.com, including the FEN position and PGN solution.",
    inputSchema: {},
  },
  async () => {
    const data = await api.getDailyPuzzle();
    const lines = [
      `Title: ${data.title}`,
      `URL: ${data.url}`,
      `Published: ${formatTimestamp(data.publish_time)}`,
      `FEN: ${data.fen}`,
      `PGN: ${data.pgn}`,
    ];
    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  },
);

server.registerTool(
  "get_random_puzzle",
  {
    title: "Get Random Puzzle",
    description:
      "Get a random daily chess puzzle from Chess.com, including the FEN position and PGN solution.",
    inputSchema: {},
  },
  async () => {
    const data = await api.getRandomPuzzle();
    const lines = [
      `Title: ${data.title}`,
      `URL: ${data.url}`,
      `Published: ${formatTimestamp(data.publish_time)}`,
      `FEN: ${data.fen}`,
      `PGN: ${data.pgn}`,
    ];
    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  },
);

// ─── Streamers tool ────────────────────────────────────────────────

server.registerTool(
  "get_streamers",
  {
    title: "Get Streamers",
    description: "Get a list of Chess.com streamers and their information.",
    inputSchema: {},
  },
  async () => {
    const data = await api.getStreamers();
    return {
      content: [{ type: "text", text: jsonBlock(data.streamers) }],
    };
  },
);

// ─── Leaderboards tool ─────────────────────────────────────────────

server.registerTool(
  "get_leaderboards",
  {
    title: "Get Leaderboards",
    description:
      "Get Chess.com leaderboards for all game types (daily, rapid, blitz, bullet, etc.), tactics, and puzzle rush.",
    inputSchema: {},
  },
  async () => {
    const data = await api.getLeaderboards();
    return {
      content: [{ type: "text", text: jsonBlock(data) }],
    };
  },
);

// ═══════════════════════════════════════════════════════════════════
// LICHESS TOOLS
// ═══════════════════════════════════════════════════════════════════

function formatLichessTimestamp(ms: number): string {
  return new Date(ms).toISOString();
}

function formatLichessUser(u: lichess.LichessUser): string {
  const lines: string[] = [`Username: ${u.username}`, `URL: ${u.url}`];
  if (u.title) lines.push(`Title: ${u.title}`);
  if (u.profile?.firstName || u.profile?.lastName)
    lines.push(
      `Name: ${[u.profile.firstName, u.profile.lastName].filter(Boolean).join(" ")}`,
    );
  if (u.patron) lines.push(`Patron: yes`);
  lines.push(
    `Games: ${u.count.all} (W: ${u.count.win} / L: ${u.count.loss} / D: ${u.count.draw})`,
  );
  if (u.playTime)
    lines.push(
      `Play time: ${Math.round(u.playTime.total / 3600)}h total, ${Math.round(u.playTime.tv / 3600)}h on TV`,
    );
  lines.push(`Created: ${formatLichessTimestamp(u.createdAt)}`);
  lines.push(`Last seen: ${formatLichessTimestamp(u.seenAt)}`);
  if (u.profile?.country) lines.push(`Country: ${u.profile.country}`);
  if (u.profile?.bio) lines.push(`Bio: ${u.profile.bio}`);

  const perfLines: string[] = [];
  for (const [key, val] of Object.entries(u.perfs)) {
    perfLines.push(
      `  ${key}: ${val.rating}${val.prov ? "?" : ""} (${val.games} games, ${val.prog >= 0 ? "+" : ""}${val.prog})`,
    );
  }
  if (perfLines.length > 0) lines.push(`Ratings:\n${perfLines.join("\n")}`);

  return lines.join("\n");
}

// ─── Lichess: User tools ───────────────────────────────────────────

server.registerTool(
  "lichess_get_user",
  {
    title: "Lichess: Get User",
    description:
      "Get a Lichess user's profile including ratings across all variants, game counts, play time, and bio.",
    inputSchema: {
      username: z.string().describe("Lichess username"),
    },
  },
  async ({ username }) => {
    const user = await lichess.getUser(username);
    return {
      content: [{ type: "text", text: formatLichessUser(user) }],
    };
  },
);

server.registerTool(
  "lichess_get_user_status",
  {
    title: "Lichess: User Online Status",
    description:
      "Check if one or more Lichess users are online, playing, or streaming. Provide up to 100 comma-separated usernames.",
    inputSchema: {
      usernames: z
        .string()
        .describe("Comma-separated Lichess usernames (up to 100)"),
    },
  },
  async ({ usernames }) => {
    const ids = usernames.split(",").map((s) => s.trim());
    const statuses = await lichess.getUserStatus(ids);
    const lines = statuses.map((s) => {
      const flags = [
        s.online ? "online" : "offline",
        s.playing ? "playing" : null,
        s.streaming ? "streaming" : null,
      ]
        .filter(Boolean)
        .join(", ");
      return `${s.title ? s.title + " " : ""}${s.name}: ${flags}`;
    });
    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  },
);

server.registerTool(
  "lichess_get_rating_history",
  {
    title: "Lichess: Rating History",
    description:
      "Get the rating history of a Lichess user across all variants. Returns daily data points.",
    inputSchema: {
      username: z.string().describe("Lichess username"),
    },
  },
  async ({ username }) => {
    const history = await lichess.getRatingHistory(username);
    const lines = history.map((entry) => {
      const recent = entry.points.slice(-5);
      const recentStr = recent
        .map(
          (p) =>
            `${p[0]}-${String(p[1] + 1).padStart(2, "0")}-${String(p[2]).padStart(2, "0")}: ${p[3]}`,
        )
        .join(", ");
      return `${entry.name} (${entry.points.length} data points): latest: ${recentStr}`;
    });
    return {
      content: [
        {
          type: "text",
          text: lines.length > 0 ? lines.join("\n") : "No rating history.",
        },
      ],
    };
  },
);

server.registerTool(
  "lichess_get_perf_stats",
  {
    title: "Lichess: Performance Stats",
    description:
      "Get detailed performance statistics for a Lichess user in a specific variant/speed. Includes best wins, worst losses, streaks, and rating distribution.",
    inputSchema: {
      username: z.string().describe("Lichess username"),
      perf: z
        .enum([
          "ultraBullet",
          "bullet",
          "blitz",
          "rapid",
          "classical",
          "correspondence",
          "chess960",
          "crazyhouse",
          "antichess",
          "atomic",
          "horde",
          "kingOfTheHill",
          "racingKings",
          "threeCheck",
        ])
        .describe("Performance type / variant"),
    },
  },
  async ({ username, perf }) => {
    const data = await lichess.getPerfStats(username, perf);
    return {
      content: [{ type: "text", text: jsonBlock(data) }],
    };
  },
);

server.registerTool(
  "lichess_get_user_activity",
  {
    title: "Lichess: User Activity",
    description:
      "Get recent activity of a Lichess user: games played, tournaments, practice, etc.",
    inputSchema: {
      username: z.string().describe("Lichess username"),
    },
  },
  async ({ username }) => {
    const data = await lichess.getUserActivity(username);
    return {
      content: [{ type: "text", text: jsonBlock(data) }],
    };
  },
);

// ─── Lichess: Game tools ───────────────────────────────────────────

server.registerTool(
  "lichess_get_user_games",
  {
    title: "Lichess: Get User Games",
    description:
      "Get recent games of a Lichess user. Returns up to the specified max number of games with optional filters.",
    inputSchema: {
      username: z.string().describe("Lichess username"),
      max: z
        .number()
        .int()
        .min(1)
        .max(30)
        .optional()
        .describe("Maximum number of games to return (1-30, default 10)"),
      rated: z.boolean().optional().describe("Filter by rated/unrated games"),
      perfType: z
        .string()
        .optional()
        .describe("Filter by perf type (e.g. bullet, blitz, rapid, classical)"),
      color: z
        .enum(["white", "black"])
        .optional()
        .describe("Filter by color played"),
    },
  },
  async ({ username, max, rated, perfType, color }) => {
    const games = await lichess.getUserGames(username, {
      max: max ?? 10,
      rated,
      perfType,
      color,
      opening: true,
    });
    return {
      content: [
        {
          type: "text",
          text:
            games.length === 0
              ? `No games found for ${username}.`
              : `Found ${games.length} games for ${username}.\n\n${jsonBlock(games)}`,
        },
      ],
    };
  },
);

server.registerTool(
  "lichess_get_game",
  {
    title: "Lichess: Get Game by ID",
    description:
      "Get a specific Lichess game by its 8-character game ID. Returns full game data including moves, clocks, and analysis.",
    inputSchema: {
      game_id: z.string().describe("Lichess game ID (8 characters)"),
    },
  },
  async ({ game_id }) => {
    const data = await lichess.getGameById(game_id);
    return {
      content: [{ type: "text", text: jsonBlock(data) }],
    };
  },
);

server.registerTool(
  "lichess_get_current_game",
  {
    title: "Lichess: Current Game",
    description:
      "Get the current ongoing game of a Lichess user, or their last played game if not currently playing.",
    inputSchema: {
      username: z.string().describe("Lichess username"),
    },
  },
  async ({ username }) => {
    const data = await lichess.getCurrentGame(username);
    return {
      content: [{ type: "text", text: jsonBlock(data) }],
    };
  },
);

// ─── Lichess: Leaderboards ─────────────────────────────────────────

server.registerTool(
  "lichess_get_leaderboards",
  {
    title: "Lichess: All Leaderboards",
    description:
      "Get the top 10 players across all Lichess variants and speeds (bullet, blitz, rapid, classical, etc).",
    inputSchema: {},
  },
  async () => {
    const data = await lichess.getAllLeaderboards();
    return {
      content: [{ type: "text", text: jsonBlock(data) }],
    };
  },
);

server.registerTool(
  "lichess_get_leaderboard",
  {
    title: "Lichess: Leaderboard by Variant",
    description: "Get the top N players for a specific Lichess variant/speed.",
    inputSchema: {
      nb: z
        .number()
        .int()
        .min(1)
        .max(200)
        .describe("Number of players (1-200)"),
      perf_type: z
        .enum([
          "ultraBullet",
          "bullet",
          "blitz",
          "rapid",
          "classical",
          "chess960",
          "crazyhouse",
          "antichess",
          "atomic",
          "horde",
          "kingOfTheHill",
          "racingKings",
          "threeCheck",
        ])
        .describe("Performance type / variant"),
    },
  },
  async ({ nb, perf_type }) => {
    const data = await lichess.getLeaderboard(nb, perf_type);
    return {
      content: [{ type: "text", text: jsonBlock(data) }],
    };
  },
);

// ─── Lichess: Puzzles ──────────────────────────────────────────────

server.registerTool(
  "lichess_get_daily_puzzle",
  {
    title: "Lichess: Daily Puzzle",
    description:
      "Get today's daily puzzle from Lichess, including the position, solution, rating, and themes.",
    inputSchema: {},
  },
  async () => {
    const data = await lichess.getDailyPuzzle();
    const lines = [
      `Puzzle ID: ${data.puzzle.id}`,
      `Rating: ${data.puzzle.rating}`,
      `Plays: ${data.puzzle.plays}`,
      `Themes: ${data.puzzle.themes.join(", ")}`,
      `Solution: ${data.puzzle.solution.join(" ")}`,
      `Game PGN: ${data.game.pgn}`,
      `Initial Ply: ${data.puzzle.initialPly}`,
    ];
    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  },
);

server.registerTool(
  "lichess_get_puzzle",
  {
    title: "Lichess: Get Puzzle by ID",
    description:
      "Get a specific Lichess puzzle by its ID. Returns the position, solution, rating, and themes.",
    inputSchema: {
      puzzle_id: z.string().describe("Lichess puzzle ID (e.g. 'z4EbU')"),
    },
  },
  async ({ puzzle_id }) => {
    const data = await lichess.getPuzzleById(puzzle_id);
    const lines = [
      `Puzzle ID: ${data.puzzle.id}`,
      `Rating: ${data.puzzle.rating}`,
      `Plays: ${data.puzzle.plays}`,
      `Themes: ${data.puzzle.themes.join(", ")}`,
      `Solution: ${data.puzzle.solution.join(" ")}`,
      `Game PGN: ${data.game.pgn}`,
      `Initial Ply: ${data.puzzle.initialPly}`,
    ];
    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  },
);

server.registerTool(
  "lichess_get_storm_dashboard",
  {
    title: "Lichess: Puzzle Storm Dashboard",
    description: "Get the Puzzle Storm statistics for a Lichess user.",
    inputSchema: {
      username: z.string().describe("Lichess username"),
    },
  },
  async ({ username }) => {
    const data = await lichess.getStormDashboard(username);
    return {
      content: [{ type: "text", text: jsonBlock(data) }],
    };
  },
);

// ─── Lichess: Teams ────────────────────────────────────────────────

server.registerTool(
  "lichess_get_team",
  {
    title: "Lichess: Get Team",
    description:
      "Get a Lichess team's profile including name, description, leader, and member count.",
    inputSchema: {
      team_id: z.string().describe("Lichess team ID / slug"),
    },
  },
  async ({ team_id }) => {
    const data = await lichess.getTeam(team_id);
    const lines = [
      `Name: ${data.name}`,
      `ID: ${data.id}`,
      `Members: ${data.nbMembers}`,
      `Open: ${data.open}`,
      `Description: ${data.description}`,
    ];
    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  },
);

server.registerTool(
  "lichess_search_teams",
  {
    title: "Lichess: Search Teams",
    description: "Search for Lichess teams by name.",
    inputSchema: {
      query: z.string().describe("Search query"),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Page number (default 1)"),
    },
  },
  async ({ query, page }) => {
    const data = await lichess.searchTeams(query, page ?? 1);
    return {
      content: [{ type: "text", text: jsonBlock(data) }],
    };
  },
);

server.registerTool(
  "lichess_get_user_teams",
  {
    title: "Lichess: User's Teams",
    description: "Get all teams a Lichess user is a member of.",
    inputSchema: {
      username: z.string().describe("Lichess username"),
    },
  },
  async ({ username }) => {
    const data = await lichess.getUserTeams(username);
    return {
      content: [{ type: "text", text: jsonBlock(data) }],
    };
  },
);

// ─── Lichess: Tournaments ──────────────────────────────────────────

server.registerTool(
  "lichess_get_current_tournaments",
  {
    title: "Lichess: Current Tournaments",
    description:
      "Get the current tournament schedule on Lichess: created, started, and finished tournaments.",
    inputSchema: {},
  },
  async () => {
    const data = await lichess.getCurrentTournaments();
    return {
      content: [{ type: "text", text: jsonBlock(data) }],
    };
  },
);

server.registerTool(
  "lichess_get_tournament",
  {
    title: "Lichess: Get Tournament",
    description:
      "Get details about a specific Lichess arena tournament, including standings.",
    inputSchema: {
      tournament_id: z.string().describe("Lichess tournament ID"),
      page: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Standings page (1-200, default 1)"),
    },
  },
  async ({ tournament_id, page }) => {
    const data = await lichess.getTournament(tournament_id, page ?? 1);
    return {
      content: [{ type: "text", text: jsonBlock(data) }],
    };
  },
);

server.registerTool(
  "lichess_get_user_tournaments",
  {
    title: "Lichess: User's Tournaments",
    description: "Get tournaments a Lichess user has played in.",
    inputSchema: {
      username: z.string().describe("Lichess username"),
    },
  },
  async ({ username }) => {
    const data = await lichess.getUserTournaments(username);
    return {
      content: [
        {
          type: "text",
          text:
            data.length === 0
              ? `${username} has no tournament history.`
              : `Found ${data.length} tournaments for ${username}.\n\n${jsonBlock(data)}`,
        },
      ],
    };
  },
);

// ─── Lichess: TV ───────────────────────────────────────────────────

server.registerTool(
  "lichess_get_tv_channels",
  {
    title: "Lichess: TV Channels",
    description:
      "Get the current featured game on each Lichess TV channel (best game per variant/speed).",
    inputSchema: {},
  },
  async () => {
    const data = await lichess.getTvChannels();
    return {
      content: [{ type: "text", text: jsonBlock(data) }],
    };
  },
);

server.registerTool(
  "lichess_get_tv_games",
  {
    title: "Lichess: TV Channel Games",
    description:
      "Get the best ongoing games from a specific Lichess TV channel.",
    inputSchema: {
      channel: z
        .enum([
          "best",
          "bullet",
          "blitz",
          "rapid",
          "classical",
          "ultraBullet",
          "bot",
          "computer",
          "chess960",
          "crazyhouse",
          "antichess",
          "atomic",
          "horde",
          "kingOfTheHill",
          "racingKings",
          "threeCheck",
        ])
        .describe("TV channel name"),
      nb: z
        .number()
        .int()
        .min(1)
        .max(30)
        .optional()
        .describe("Number of games (1-30, default 10)"),
    },
  },
  async ({ channel, nb }) => {
    const data = await lichess.getTvGames(channel, nb ?? 10);
    return {
      content: [{ type: "text", text: jsonBlock(data) }],
    };
  },
);

// ─── Lichess: Streamers ────────────────────────────────────────────

server.registerTool(
  "lichess_get_streamers",
  {
    title: "Lichess: Live Streamers",
    description: "Get currently live Lichess streamers on Twitch and YouTube.",
    inputSchema: {},
  },
  async () => {
    const data = await lichess.getLiveStreamers();
    return {
      content: [
        {
          type: "text",
          text:
            data.length === 0
              ? "No streamers are currently live."
              : jsonBlock(data),
        },
      ],
    };
  },
);

// ─── Lichess: Crosstable ───────────────────────────────────────────

server.registerTool(
  "lichess_get_crosstable",
  {
    title: "Lichess: Head-to-Head",
    description:
      "Get the head-to-head record between two Lichess users: total games and score.",
    inputSchema: {
      user1: z.string().describe("First Lichess username"),
      user2: z.string().describe("Second Lichess username"),
    },
  },
  async ({ user1, user2 }) => {
    const data = await lichess.getCrosstable(user1, user2);
    const users = Object.entries(data.users);
    const lines = [
      `Total games: ${data.nbGames}`,
      ...users.map(([name, score]) => `${name}: ${score}`),
    ];
    if (data.matchup) {
      lines.push(`\nCurrent matchup (${data.matchup.nbGames} games):`);
      for (const [name, score] of Object.entries(data.matchup.users)) {
        lines.push(`  ${name}: ${score}`);
      }
    }
    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  },
);

// ─── Lichess: Cloud eval ───────────────────────────────────────────

server.registerTool(
  "lichess_get_cloud_eval",
  {
    title: "Lichess: Cloud Evaluation",
    description:
      "Get the cloud engine evaluation for a FEN position from Lichess's analysis database.",
    inputSchema: {
      fen: z.string().describe("FEN string of the position to evaluate"),
    },
  },
  async ({ fen }) => {
    const data = await lichess.getCloudEval(fen);
    return {
      content: [{ type: "text", text: jsonBlock(data) }],
    };
  },
);

// ─── Start server ──────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error starting server:", error);
  process.exit(1);
});
