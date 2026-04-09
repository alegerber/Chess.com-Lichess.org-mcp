import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as lichess from "../lichess-api.js";
import { jsonBlock, toISOString, truncated, text } from "../format.js";

// ─── Formatters ────────────────────────────────────────────────────

function formatUser(u: lichess.LichessUser): string {
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
  lines.push(`Created: ${toISOString(u.createdAt)}`);
  lines.push(`Last seen: ${toISOString(u.seenAt)}`);
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

function formatPuzzle(data: lichess.LichessPuzzle): string {
  return [
    `Puzzle ID: ${data.puzzle.id}`,
    `Rating: ${data.puzzle.rating}`,
    `Plays: ${data.puzzle.plays}`,
    `Themes: ${data.puzzle.themes.join(", ")}`,
    `Solution: ${data.puzzle.solution.join(" ")}`,
    `Game PGN: ${data.game.pgn}`,
    `Initial Ply: ${data.puzzle.initialPly}`,
  ].join("\n");
}

// ─── Error handler ─────────────────────────────────────────────────

async function call<T>(fn: () => Promise<T>, format: (d: T) => string) {
  try {
    return text(format(await fn()));
  } catch (e) {
    if (e instanceof lichess.LichessApiError) {
      return text(`Lichess error (${e.status}): ${e.message}`);
    }
    throw e;
  }
}

// ─── Tool registration ─────────────────────────────────────────────

export function registerLichessTools(server: McpServer): void {
  // ── User tools ─────────────────────────────────────────────────────

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
    ({ username }) => call(() => lichess.getUser(username), formatUser),
  );

  server.registerTool(
    "lichess_get_user_status",
    {
      title: "Lichess: User Online Status",
      description:
        "Check if one or more Lichess users are online, playing, or streaming. Accepts up to 100 usernames.",
      inputSchema: {
        usernames: z
          .array(z.string())
          .max(100)
          .describe("Lichess usernames (up to 100)"),
      },
    },
    ({ usernames }) =>
      call(
        () => lichess.getUserStatus(usernames),
        (statuses) => {
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
          return lines.join("\n");
        },
      ),
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
    ({ username }) =>
      call(
        () => lichess.getRatingHistory(username),
        (history) => {
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
          return lines.length > 0 ? lines.join("\n") : "No rating history.";
        },
      ),
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
    ({ username, perf }) =>
      call(() => lichess.getPerfStats(username, perf), jsonBlock),
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
    ({ username }) => call(() => lichess.getUserActivity(username), jsonBlock),
  );

  // ── Game tools ─────────────────────────────────────────────────────

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
          .describe(
            "Filter by perf type (e.g. bullet, blitz, rapid, classical)",
          ),
        color: z
          .enum(["white", "black"])
          .optional()
          .describe("Filter by color played"),
      },
    },
    ({ username, max, rated, perfType, color }) =>
      call(
        () =>
          lichess.getUserGames(username, {
            max: max ?? 10,
            rated,
            perfType,
            color,
            opening: true,
          }),
        (games) =>
          games.length === 0
            ? `No games found for ${username}.`
            : `Found ${games.length} games for ${username}.\n\n${jsonBlock(games)}`,
      ),
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
    ({ game_id }) => call(() => lichess.getGameById(game_id), jsonBlock),
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
    ({ username }) => call(() => lichess.getCurrentGame(username), jsonBlock),
  );

  // ── Leaderboards ───────────────────────────────────────────────────

  server.registerTool(
    "lichess_get_leaderboards",
    {
      title: "Lichess: All Leaderboards",
      description:
        "Get the top 10 players across all Lichess variants and speeds (bullet, blitz, rapid, classical, etc).",
      inputSchema: {},
    },
    () => call(() => lichess.getAllLeaderboards(), jsonBlock),
  );

  server.registerTool(
    "lichess_get_leaderboard",
    {
      title: "Lichess: Leaderboard by Variant",
      description:
        "Get the top N players for a specific Lichess variant/speed.",
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
    ({ nb, perf_type }) =>
      call(() => lichess.getLeaderboard(nb, perf_type), jsonBlock),
  );

  // ── Puzzles ────────────────────────────────────────────────────────

  server.registerTool(
    "lichess_get_daily_puzzle",
    {
      title: "Lichess: Daily Puzzle",
      description:
        "Get today's daily puzzle from Lichess, including the position, solution, rating, and themes.",
      inputSchema: {},
    },
    () => call(() => lichess.getDailyPuzzle(), formatPuzzle),
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
    ({ puzzle_id }) =>
      call(() => lichess.getPuzzleById(puzzle_id), formatPuzzle),
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
    ({ username }) =>
      call(() => lichess.getStormDashboard(username), jsonBlock),
  );

  // ── Teams ──────────────────────────────────────────────────────────

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
    ({ team_id }) =>
      call(
        () => lichess.getTeam(team_id),
        (d) =>
          [
            `Name: ${d.name}`,
            `ID: ${d.id}`,
            `Members: ${d.nbMembers}`,
            `Open: ${d.open}`,
            `Description: ${d.description}`,
          ].join("\n"),
      ),
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
    ({ query, page }) =>
      call(() => lichess.searchTeams(query, page ?? 1), jsonBlock),
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
    ({ username }) => call(() => lichess.getUserTeams(username), jsonBlock),
  );

  server.registerTool(
    "lichess_get_team_members",
    {
      title: "Lichess: Team Members",
      description: "Get members of a Lichess team.",
      inputSchema: {
        team_id: z.string().describe("Lichess team ID / slug"),
      },
    },
    ({ team_id }) =>
      call(
        () => lichess.getTeamMembers(team_id),
        (members) => truncated(members, 50, "members"),
      ),
  );

  // ── Tournaments ────────────────────────────────────────────────────

  server.registerTool(
    "lichess_get_current_tournaments",
    {
      title: "Lichess: Current Tournaments",
      description:
        "Get the current tournament schedule on Lichess: created, started, and finished tournaments.",
      inputSchema: {},
    },
    () => call(() => lichess.getCurrentTournaments(), jsonBlock),
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
    ({ tournament_id, page }) =>
      call(() => lichess.getTournament(tournament_id, page ?? 1), jsonBlock),
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
    ({ username }) =>
      call(
        () => lichess.getUserTournaments(username),
        (data) =>
          data.length === 0
            ? `${username} has no tournament history.`
            : `Found ${data.length} tournaments for ${username}.\n\n${truncated(data, 20, "tournaments")}`,
      ),
  );

  // ── TV ─────────────────────────────────────────────────────────────

  server.registerTool(
    "lichess_get_tv_channels",
    {
      title: "Lichess: TV Channels",
      description:
        "Get the current featured game on each Lichess TV channel (best game per variant/speed).",
      inputSchema: {},
    },
    () => call(() => lichess.getTvChannels(), jsonBlock),
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
    ({ channel, nb }) =>
      call(() => lichess.getTvGames(channel, nb ?? 10), jsonBlock),
  );

  // ── Streamers ──────────────────────────────────────────────────────

  server.registerTool(
    "lichess_get_streamers",
    {
      title: "Lichess: Live Streamers",
      description:
        "Get currently live Lichess streamers on Twitch and YouTube.",
      inputSchema: {},
    },
    () =>
      call(
        () => lichess.getLiveStreamers(),
        (data) =>
          data.length === 0
            ? "No streamers are currently live."
            : jsonBlock(data),
      ),
  );

  // ── Crosstable ─────────────────────────────────────────────────────

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
    ({ user1, user2 }) =>
      call(
        () => lichess.getCrosstable(user1, user2),
        (data) => {
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
          return lines.join("\n");
        },
      ),
  );

  // ── Cloud eval ─────────────────────────────────────────────────────

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
    ({ fen }) => call(() => lichess.getCloudEval(fen), jsonBlock),
  );
}
