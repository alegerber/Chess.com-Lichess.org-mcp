#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as api from "./chess-api.js";

const server = new McpServer({
  name: "chess-com-mcp",
  version: "1.0.0",
});

// ─── Helper ────────────────────────────────────────────────────────

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toISOString();
}

function formatProfile(p: api.PlayerProfile): string {
  const lines: string[] = [
    `Username: ${p.username}`,
    `URL: ${p.url}`,
  ];
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
      username: z
        .string()
        .describe("Chess.com username"),
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
      username: z
        .string()
        .describe("Chess.com username"),
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
      username: z
        .string()
        .describe("Chess.com username"),
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
    description:
      "Get the daily chess games a player is currently playing.",
    inputSchema: {
      username: z
        .string()
        .describe("Chess.com username"),
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
    description:
      "Get daily chess games where it is the player's turn to move.",
    inputSchema: {
      username: z
        .string()
        .describe("Chess.com username"),
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
      username: z
        .string()
        .describe("Chess.com username"),
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
      username: z
        .string()
        .describe("Chess.com username"),
      year: z
        .number()
        .int()
        .min(2007)
        .describe("Four-digit year (e.g. 2024)"),
      month: z
        .number()
        .int()
        .min(1)
        .max(12)
        .describe("Month number (1-12)"),
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
      username: z
        .string()
        .describe("Chess.com username"),
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
      username: z
        .string()
        .describe("Chess.com username"),
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
      username: z
        .string()
        .describe("Chess.com username"),
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
        .describe(
          'Club URL ID / slug (e.g. "chess-com-developer-community")',
        ),
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
      url_id: z
        .string()
        .describe("Club URL ID / slug"),
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
      content: [
        { type: "text", text: `${summary}\n\n${jsonBlock(data)}` },
      ],
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
      url_id: z
        .string()
        .describe("Club URL ID / slug"),
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
      url_id: z
        .string()
        .describe("Tournament URL ID / slug"),
      round: z
        .number()
        .int()
        .min(1)
        .describe("Round number"),
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
      url_id: z
        .string()
        .describe("Tournament URL ID / slug"),
      round: z
        .number()
        .int()
        .min(1)
        .describe("Round number"),
      group: z
        .number()
        .int()
        .min(1)
        .describe("Group number"),
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
      match_id: z
        .number()
        .int()
        .describe("Team match ID (numeric)"),
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
    description:
      "Get details about a specific board in a daily team match.",
    inputSchema: {
      match_id: z
        .number()
        .int()
        .describe("Team match ID (numeric)"),
      board: z
        .number()
        .int()
        .min(1)
        .describe("Board number"),
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
      match_id: z
        .number()
        .int()
        .describe("Live team match ID (numeric)"),
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
    description:
      "Get details about a specific board in a live team match.",
    inputSchema: {
      match_id: z
        .number()
        .int()
        .describe("Live team match ID (numeric)"),
      board: z
        .number()
        .int()
        .min(1)
        .describe("Board number"),
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
    description:
      "Get a list of player usernames from a specific country.",
    inputSchema: {
      iso_code: z
        .string()
        .length(2)
        .describe("2-letter ISO 3166 country code"),
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
    description:
      "Get a list of club URLs from a specific country.",
    inputSchema: {
      iso_code: z
        .string()
        .length(2)
        .describe("2-letter ISO 3166 country code"),
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
    description:
      "Get a list of Chess.com streamers and their information.",
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

// ─── Start server ──────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error starting server:", error);
  process.exit(1);
});
