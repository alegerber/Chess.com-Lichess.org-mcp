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

/** Media type Lichess uses for raw PGN responses on game/export endpoints. */
export const PGN_MEDIA_TYPE = "application/x-chess-pgn";

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
 * Fetch a raw text body (e.g. PGN) with an explicit Accept header. Game/export
 * endpoints return PGN when asked via content negotiation (#46); the size cap is
 * applied by the caller's formatter (capText) so this stays a thin transport.
 */
async function fetchText(path: string, accept: string): Promise<string> {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: accept,
    },
    signal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new LichessApiError(
      response.status,
      `Lichess API error ${response.status}: ${response.statusText} for ${url}`,
    );
  }

  return response.text();
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

/**
 * Fetch a raw text body (e.g. PGN) but stop and abort once maxChars have
 * arrived. Tournament game exports are unbounded (a whole event), so this caps
 * the *download*, not just the displayed output, keeping memory bounded.
 */
async function fetchTextBounded(
  path: string,
  accept: string,
  maxChars: number,
): Promise<string> {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: accept,
    },
    signal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new LichessApiError(
      response.status,
      `Lichess API error ${response.status}: ${response.statusText} for ${url}`,
    );
  }

  if (!response.body) return (await response.text()).slice(0, maxChars);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    if (buffer.length >= maxChars) {
      await reader.cancel();
      break;
    }
  }
  buffer += decoder.decode();
  // Honour the documented bound: the final flush can emit a few trailing bytes
  // past maxChars, so clamp before returning.
  return buffer.slice(0, maxChars);
}

/**
 * POST a plain-text body (a comma-separated ID list) and return the raw text
 * response with the requested Accept type. Used by the bulk endpoints (#43),
 * which take the IDs in the request body and content-negotiate JSON/NDJSON/PGN.
 */
async function postText(
  path: string,
  body: string,
  accept: string,
): Promise<string> {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: accept,
      "Content-Type": "text/plain",
    },
    body,
    signal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new LichessApiError(
      response.status,
      `Lichess API error ${response.status}: ${response.statusText} for ${url}`,
    );
  }

  return response.text();
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
  asPgn = false,
): Promise<unknown[] | string> {
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
  const path = `/api/games/user/${encodeURIComponent(username)}${qs ? `?${qs}` : ""}`;
  return asPgn ? fetchText(path, PGN_MEDIA_TYPE) : fetchNdjson(path);
}

export function getGameById(
  gameId: string,
  asPgn = false,
): Promise<unknown | string> {
  const path = `/game/export/${encodeURIComponent(gameId)}`;
  return asPgn ? fetchText(path, PGN_MEDIA_TYPE) : fetchJson(path);
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

// ─── Bulk endpoints ────────────────────────────────────────────────

// POST /api/users takes the IDs in the body (up to 300) and returns a JSON
// array of full user objects.
export function getUsersByIds(ids: string[]): Promise<LichessUser[]> {
  return postText("/api/users", ids.join(","), "application/json").then(
    (t) => JSON.parse(t) as LichessUser[],
  );
}

// POST /api/games/export/_ids takes the game IDs in the body and content-
// negotiates the format: NDJSON (parsed to an array) or raw PGN.
export function exportGamesByIds(
  ids: string[],
  asPgn: boolean,
): Promise<unknown[] | string> {
  const body = ids.join(",");
  return asPgn
    ? postText("/api/games/export/_ids", body, PGN_MEDIA_TYPE)
    : postText("/api/games/export/_ids", body, "application/x-ndjson").then(
        (t) => parseNdjson(t),
      );
}

// ─── Cloud eval ────────────────────────────────────────────────────

export function getCloudEval(fen: string): Promise<unknown> {
  return fetchJson(`/api/cloud-eval?fen=${encodeURIComponent(fen)}`);
}

// ─── Swiss / Arena tournaments + Simuls ────────────────────────────

// Shared caps: standings stream is bounded by rows; games (a whole event) by
// characters so the PGN download itself stays bounded.
const STANDINGS_MAX = 100;
const TOURNEY_PGN_MAX_CHARS = 50_000;
const TOURNEY_PGN_MEDIA_TYPE = "application/x-chess-pgn";

export interface SwissInfo {
  id: string;
  name: string;
  status: string;
  variant: string;
  round: number;
  nbRounds: number;
  nbPlayers: number;
  nbOngoing?: number;
  clock?: { limit: number; increment: number };
  startsAt?: string;
  createdBy?: string;
}

// One standings row, tolerant of the small differences between the Swiss
// (`points`) and Arena (`score`) results streams.
export interface StandingRow {
  rank: number;
  username: string;
  rating?: number;
  points?: number;
  score?: number;
  performance?: number;
  title?: string;
}

export interface Simul {
  id: string;
  name: string;
  fullName: string;
  host: { name: string; id: string; rating?: number };
  nbApplicants?: number;
  nbPairings?: number;
  variants?: { name: string }[];
}

export interface SimulsResponse {
  pending?: Simul[];
  created?: Simul[];
  started?: Simul[];
  finished?: Simul[];
}

export function getSwiss(id: string): Promise<SwissInfo> {
  return fetchJson(`/api/swiss/${encodeURIComponent(id)}`);
}

export function getSwissResults(id: string): Promise<StandingRow[]> {
  return fetchNdjson(
    `/api/swiss/${encodeURIComponent(id)}/results`,
    STANDINGS_MAX,
  );
}

export function getSwissGames(
  id: string,
  asPgn: boolean,
): Promise<unknown[] | string> {
  const path = `/api/swiss/${encodeURIComponent(id)}/games`;
  return asPgn
    ? fetchTextBounded(path, TOURNEY_PGN_MEDIA_TYPE, TOURNEY_PGN_MAX_CHARS)
    : fetchNdjson(path, STANDINGS_MAX);
}

export function getArenaResults(id: string): Promise<StandingRow[]> {
  return fetchNdjson(
    `/api/tournament/${encodeURIComponent(id)}/results`,
    STANDINGS_MAX,
  );
}

export function getArenaGames(
  id: string,
  asPgn: boolean,
): Promise<unknown[] | string> {
  const path = `/api/tournament/${encodeURIComponent(id)}/games`;
  return asPgn
    ? fetchTextBounded(path, TOURNEY_PGN_MEDIA_TYPE, TOURNEY_PGN_MAX_CHARS)
    : fetchNdjson(path, STANDINGS_MAX);
}

export function getSimuls(): Promise<SimulsResponse> {
  return fetchJson("/api/simul");
}

// ─── FIDE players ──────────────────────────────────────────────────

export interface FidePlayer {
  id: number;
  name: string;
  federation?: string;
  year?: number;
  title?: string;
  standard?: number;
  rapid?: number;
  blitz?: number;
  gender?: string;
}

export function getFidePlayer(playerId: number): Promise<FidePlayer> {
  return fetchJson(`/api/fide/player/${playerId}`);
}

// Name search returns a JSON array (not NDJSON) of the same player objects.
export function searchFidePlayers(query: string): Promise<FidePlayer[]> {
  return fetchJson(`/api/fide/player?q=${encodeURIComponent(query)}`);
}

// ─── Player autocomplete ───────────────────────────────────────────

export interface AutocompletePlayer {
  id: string;
  name: string;
  title?: string;
  patron?: boolean;
  online?: boolean;
  flair?: string;
}

export interface AutocompleteResult {
  result: AutocompletePlayer[];
}

// object=true returns rich objects ({id,name,title,online,...}) instead of a
// plain username array, so callers can show titles/online state.
export function autocompletePlayers(term: string): Promise<AutocompleteResult> {
  return fetchJson(
    `/api/player/autocomplete?term=${encodeURIComponent(term)}&object=true`,
  );
}

// ─── Studies ───────────────────────────────────────────────────────

export interface StudyMetadata {
  id: string;
  name: string;
  createdAt?: number;
  updatedAt?: number;
}

const USER_STUDIES_MAX = 100;

// Public studies only — private studies need a token (#30).
export function getUserStudies(username: string): Promise<StudyMetadata[]> {
  return fetchNdjson(
    `/api/study/by/${encodeURIComponent(username)}`,
    USER_STUDIES_MAX,
  );
}

export function exportStudyPgn(studyId: string): Promise<string> {
  return fetchText(
    `/api/study/${encodeURIComponent(studyId)}.pgn`,
    PGN_MEDIA_TYPE,
  );
}

export function exportStudyChapterPgn(
  studyId: string,
  chapterId: string,
): Promise<string> {
  return fetchText(
    `/api/study/${encodeURIComponent(studyId)}/${encodeURIComponent(chapterId)}.pgn`,
    PGN_MEDIA_TYPE,
  );
}

// ─── Broadcasts / live relays ──────────────────────────────────────

export interface BroadcastEntry {
  tour?: { id: string; name: string };
  round?: { id: string; name: string };
  rounds?: { id: string; name: string }[];
  defaultRoundId?: string;
}

export interface TopBroadcasts {
  active?: BroadcastEntry[];
  upcoming?: BroadcastEntry[];
  past?: BroadcastEntry[];
}

// /api/broadcast/by/{user} returns a paginated JSON wrapper (not NDJSON).
export interface BroadcastsByUser {
  currentPage?: number;
  maxPerPage?: number;
  currentPageResults?: BroadcastEntry[];
}

const BROADCASTS_MAX = 30;

// /api/broadcast streams NDJSON, one broadcast tournament per line.
export function getBroadcasts(): Promise<BroadcastEntry[]> {
  return fetchNdjson("/api/broadcast", BROADCASTS_MAX);
}

export function getTopBroadcasts(): Promise<TopBroadcasts> {
  return fetchJson("/api/broadcast/top");
}

export function getBroadcastsByUser(
  username: string,
): Promise<BroadcastsByUser> {
  return fetchJson(`/api/broadcast/by/${encodeURIComponent(username)}`);
}

export function getBroadcastRoundPgn(roundId: string): Promise<string> {
  return fetchText(
    `/api/broadcast/round/${encodeURIComponent(roundId)}.pgn`,
    PGN_MEDIA_TYPE,
  );
}
