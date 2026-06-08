import { VERSION } from "./version.js";

const BASE_URL = "https://lichess.org";

const USER_AGENT = `chess-com-lichess-org-mcp/${VERSION} (MCP Server; https://github.com/alegerber/chess-com-lichess-org-mcp)`;

export class LichessApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "LichessApiError";
  }
}

const JSON_TIMEOUT_MS = 10_000;
const STREAM_TIMEOUT_MS = 30_000;

async function fetchJson<T>(path: string): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(JSON_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new LichessApiError(
      response.status,
      `Lichess API error ${response.status}: ${response.statusText} for ${url}`,
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Parse NDJSON text into an array. CRLF-safe, skips blank and malformed lines
 * (so one truncated record never discards the whole result), and stops at
 * maxLines when provided.
 */
export function parseNdjson<T>(text: string, maxLines?: number): T[] {
  const out: T[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      continue;
    }
    if (maxLines !== undefined && out.length >= maxLines) break;
  }
  return out;
}

/**
 * Stream an NDJSON endpoint. When maxLines is set, stop reading (and abort the
 * request) once that many lines have arrived, so unbounded endpoints (e.g. team
 * members) cannot buffer hundreds of MB into memory.
 */
async function fetchNdjson<T>(path: string, maxLines?: number): Promise<T[]> {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/x-ndjson",
    },
    signal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new LichessApiError(
      response.status,
      `Lichess API error ${response.status}: ${response.statusText} for ${url}`,
    );
  }

  // Unbounded callers are already limited by API params (max/nb) — read directly.
  if (maxLines === undefined || !response.body) {
    return parseNdjson<T>(await response.text());
  }

  // Bounded caller: read incrementally and stop once we have enough lines.
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    if (buffer.split("\n").length - 1 >= maxLines) {
      await reader.cancel();
      break;
    }
  }
  buffer += decoder.decode();
  return parseNdjson<T>(buffer, maxLines);
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

// Currently unused: /api/team/of is OAuth-only, so the tool returns a clear
// message instead of calling this (#31). Wired back up with token support (#30).
export function getUserTeams(username: string): Promise<unknown[]> {
  return fetchJson(`/api/team/of/${encodeURIComponent(username)}`);
}

// Memory safety net: large teams have hundreds of thousands of members and the
// endpoint has no server-side limit, so cap the stream well above the display cap.
const TEAM_MEMBERS_MAX = 200;

export function getTeamMembers(teamId: string): Promise<unknown[]> {
  return fetchNdjson(
    `/api/team/${encodeURIComponent(teamId)}/users`,
    TEAM_MEMBERS_MAX,
  );
}

// ─── Tournaments ───────────────────────────────────────────────────

export function getCurrentTournaments(): Promise<unknown> {
  return fetchJson("/api/tournament");
}

export function getTournament(id: string, page: number = 1): Promise<unknown> {
  return fetchJson(`/api/tournament/${encodeURIComponent(id)}?page=${page}`);
}

const USER_TOURNAMENTS_MAX = 100;

export function getUserTournaments(username: string): Promise<unknown[]> {
  return fetchNdjson(
    `/api/user/${encodeURIComponent(username)}/tournament/played`,
    USER_TOURNAMENTS_MAX,
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
  // matchup=1 includes the current head-to-head match (the formatter renders it).
  return fetchJson(
    `/api/crosstable/${encodeURIComponent(user1)}/${encodeURIComponent(user2)}?matchup=1`,
  );
}

// ─── Cloud eval ────────────────────────────────────────────────────

export function getCloudEval(fen: string): Promise<unknown> {
  return fetchJson(`/api/cloud-eval?fen=${encodeURIComponent(fen)}`);
}

// ─── Opening Explorer ──────────────────────────────────────────────

// The Opening Explorer lives on a separate host. The masters/lichess dbs
// return a single JSON object; the player db streams NDJSON (progressive
// results while indexing). Reading to completion and taking the last JSON line
// works for both. Public, no auth.
const EXPLORER_BASE = "https://explorer.lichess.ovh";

export interface ExplorerMove {
  uci: string;
  san: string;
  white: number;
  draws: number;
  black: number;
  averageRating?: number;
  averageOpponentRating?: number;
  performance?: number;
  opening?: { eco: string; name: string } | null;
}

export interface ExplorerResult {
  white: number;
  draws: number;
  black: number;
  moves: ExplorerMove[];
  opening?: { eco: string; name: string } | null;
}

export interface ExplorerParams {
  db: "masters" | "lichess" | "player";
  fen: string;
  play?: string;
  variant?: string;
  speeds?: string;
  ratings?: string;
  player?: string;
  color?: string;
  moves?: number;
}

async function fetchExplorer(
  path: string,
  query: URLSearchParams,
): Promise<ExplorerResult> {
  const url = `${EXPLORER_BASE}${path}?${query.toString()}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/x-ndjson, application/json",
    },
    signal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new LichessApiError(
      response.status,
      `Lichess API error ${response.status}: ${response.statusText} for ${url}`,
    );
  }

  // Take the last non-empty JSON line: one line for masters/lichess, the final
  // (fully indexed) line for the player db's progressive NDJSON stream.
  const body = await response.text();
  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return JSON.parse(lines[lines.length - 1] ?? "{}") as ExplorerResult;
}

export function openingExplorer(
  params: ExplorerParams,
): Promise<ExplorerResult> {
  const q = new URLSearchParams();
  q.set("fen", params.fen);
  if (params.play) q.set("play", params.play);
  if (params.moves !== undefined) q.set("moves", String(params.moves));
  if (params.db !== "masters") {
    if (params.variant) q.set("variant", params.variant);
    if (params.speeds) q.set("speeds", params.speeds);
  }
  if (params.db === "lichess" && params.ratings) {
    q.set("ratings", params.ratings);
  }
  if (params.db === "player") {
    if (params.player) q.set("player", params.player);
    if (params.color) q.set("color", params.color);
  }
  const path =
    params.db === "masters"
      ? "/masters"
      : params.db === "lichess"
        ? "/lichess"
        : "/player";
  return fetchExplorer(path, q);
}
