const BASE_URL = "https://lichess.org";

const USER_AGENT =
  "chess-com-lichess-org-mcp/1.0.0 (MCP Server; https://github.com/chess-com-lichess-org-mcp)";

export class LichessApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "LichessApiError";
  }
}

async function fetchJson<T>(path: string): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new LichessApiError(
      response.status,
      `Lichess API error ${response.status}: ${response.statusText} for ${url}`,
    );
  }

  return response.json() as Promise<T>;
}

async function fetchNdjson<T>(path: string): Promise<T[]> {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/x-ndjson",
    },
  });

  if (!response.ok) {
    throw new LichessApiError(
      response.status,
      `Lichess API error ${response.status}: ${response.statusText} for ${url}`,
    );
  }

  const text = await response.text();
  return text
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as T);
}

// ─── User endpoints ────────────────────────────────────────────────

export interface LichessUser {
  id: string;
  username: string;
  title?: string;
  patron?: boolean;
  createdAt: number;
  seenAt: number;
  playTime?: { total: number; tv: number };
  url: string;
  count: {
    all: number;
    rated: number;
    draw: number;
    loss: number;
    win: number;
    playing: number;
  };
  perfs: Record<
    string,
    {
      games: number;
      rating: number;
      rd: number;
      prog: number;
      prov?: boolean;
    }
  >;
  profile?: {
    country?: string;
    bio?: string;
    firstName?: string;
    lastName?: string;
    links?: string;
  };
  streamer?: unknown;
}

export function getUser(username: string): Promise<LichessUser> {
  return fetchJson(`/api/user/${encodeURIComponent(username)}`);
}

// ─── User status ───────────────────────────────────────────────────

export interface UserStatus {
  id: string;
  name: string;
  title?: string;
  online?: boolean;
  playing?: boolean;
  streaming?: boolean;
  patron?: boolean;
}

export function getUserStatus(userIds: string[]): Promise<UserStatus[]> {
  const ids = userIds.map((u) => encodeURIComponent(u)).join(",");
  return fetchJson(`/api/users/status?ids=${ids}`);
}

// ─── Rating history ────────────────────────────────────────────────

export interface RatingHistoryEntry {
  name: string;
  points: number[][]; // [year, month(0-indexed), day, rating]
}

export function getRatingHistory(
  username: string,
): Promise<RatingHistoryEntry[]> {
  return fetchJson(`/api/user/${encodeURIComponent(username)}/rating-history`);
}

// ─── Performance stats ─────────────────────────────────────────────

export function getPerfStats(username: string, perf: string): Promise<unknown> {
  return fetchJson(
    `/api/user/${encodeURIComponent(username)}/perf/${encodeURIComponent(perf)}`,
  );
}

// ─── User activity ─────────────────────────────────────────────────

export function getUserActivity(username: string): Promise<unknown[]> {
  return fetchJson(`/api/user/${encodeURIComponent(username)}/activity`);
}

// ─── Games ─────────────────────────────────────────────────────────

export function getUserGames(
  username: string,
  params: {
    max?: number;
    since?: number;
    until?: number;
    rated?: boolean;
    perfType?: string;
    color?: string;
    opening?: boolean;
  } = {},
): Promise<unknown[]> {
  const query = new URLSearchParams();
  if (params.max !== undefined) query.set("max", String(params.max));
  if (params.since !== undefined) query.set("since", String(params.since));
  if (params.until !== undefined) query.set("until", String(params.until));
  if (params.rated !== undefined) query.set("rated", String(params.rated));
  if (params.perfType) query.set("perfType", params.perfType);
  if (params.color) query.set("color", params.color);
  if (params.opening !== undefined)
    query.set("opening", String(params.opening));

  const qs = query.toString();
  return fetchNdjson(
    `/api/games/user/${encodeURIComponent(username)}${qs ? `?${qs}` : ""}`,
  );
}

export function getGameById(gameId: string): Promise<unknown> {
  return fetchJson(`/game/export/${encodeURIComponent(gameId)}`);
}

export function getCurrentGame(username: string): Promise<unknown> {
  return fetchJson(`/api/user/${encodeURIComponent(username)}/current-game`);
}

// ─── Leaderboards ──────────────────────────────────────────────────

export function getAllLeaderboards(): Promise<unknown> {
  return fetchJson("/api/player");
}

export function getLeaderboard(nb: number, perfType: string): Promise<unknown> {
  return fetchJson(`/api/player/top/${nb}/${encodeURIComponent(perfType)}`);
}

// ─── Puzzles ───────────────────────────────────────────────────────

export interface LichessPuzzle {
  game: {
    id: string;
    perf: { key: string; name: string };
    rated: boolean;
    players: unknown[];
    pgn: string;
    clock?: string;
  };
  puzzle: {
    id: string;
    rating: number;
    plays: number;
    solution: string[];
    themes: string[];
    initialPly: number;
  };
}

export function getDailyPuzzle(): Promise<LichessPuzzle> {
  return fetchJson("/api/puzzle/daily");
}

export function getPuzzleById(id: string): Promise<LichessPuzzle> {
  return fetchJson(`/api/puzzle/${encodeURIComponent(id)}`);
}

export function getStormDashboard(username: string): Promise<unknown> {
  return fetchJson(`/api/storm/dashboard/${encodeURIComponent(username)}`);
}

// ─── Teams ─────────────────────────────────────────────────────────

export interface LichessTeam {
  id: string;
  name: string;
  description: string;
  open: boolean;
  leader: { id: string; name: string };
  leaders: unknown[];
  nbMembers: number;
}

export function getTeam(teamId: string): Promise<LichessTeam> {
  return fetchJson(`/api/team/${encodeURIComponent(teamId)}`);
}

export function searchTeams(text: string, page: number = 1): Promise<unknown> {
  return fetchJson(
    `/api/team/search?text=${encodeURIComponent(text)}&page=${page}`,
  );
}

export function getUserTeams(username: string): Promise<unknown[]> {
  return fetchJson(`/api/team/of/${encodeURIComponent(username)}`);
}

export function getTeamMembers(teamId: string): Promise<unknown[]> {
  return fetchNdjson(`/api/team/${encodeURIComponent(teamId)}/users`);
}

// ─── Tournaments ───────────────────────────────────────────────────

export function getCurrentTournaments(): Promise<unknown> {
  return fetchJson("/api/tournament");
}

export function getTournament(id: string, page: number = 1): Promise<unknown> {
  return fetchJson(`/api/tournament/${encodeURIComponent(id)}?page=${page}`);
}

export function getUserTournaments(username: string): Promise<unknown[]> {
  return fetchNdjson(
    `/api/user/${encodeURIComponent(username)}/tournament/played`,
  );
}

// ─── TV ────────────────────────────────────────────────────────────

export function getTvChannels(): Promise<unknown> {
  return fetchJson("/api/tv/channels");
}

export function getTvGames(
  channel: string,
  nb: number = 10,
): Promise<unknown[]> {
  return fetchNdjson(`/api/tv/${encodeURIComponent(channel)}?nb=${nb}`);
}

// ─── Streamers ─────────────────────────────────────────────────────

export function getLiveStreamers(): Promise<unknown[]> {
  return fetchJson("/api/streamer/live");
}

// ─── Crosstable ────────────────────────────────────────────────────

export interface Crosstable {
  users: Record<string, number>;
  nbGames: number;
  matchup?: { users: Record<string, number>; nbGames: number };
}

export function getCrosstable(
  user1: string,
  user2: string,
): Promise<Crosstable> {
  return fetchJson(
    `/api/crosstable/${encodeURIComponent(user1)}/${encodeURIComponent(user2)}`,
  );
}

// ─── Cloud eval ────────────────────────────────────────────────────

export function getCloudEval(fen: string): Promise<unknown> {
  return fetchJson(`/api/cloud-eval?fen=${encodeURIComponent(fen)}`);
}
