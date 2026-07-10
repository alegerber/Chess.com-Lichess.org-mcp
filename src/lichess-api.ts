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

/**
 * Optional OAuth bearer for lichess.org requests (#30). Some endpoints (e.g.
 * GET /api/team/of) are no longer public; when LICHESS_TOKEN is set we attach
 * `Authorization: Bearer <token>`. Read at call time so the value can be
 * toggled (e.g. in tests). Returns an empty object when unset, so spreading it
 * into a headers literal is a no-op in the default, auth-less configuration.
 *
 * Intentionally applied ONLY to lichess.org callers — never to the separate
 * explorer.lichess.ovh / tablebase.lichess.ovh hosts, which need no auth, so
 * the token is never sent to a host that doesn't require it.
 */
export function lichessAuthHeader(): Record<string, string> {
  const token = process.env.LICHESS_TOKEN?.trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** True when an optional Lichess OAuth token is configured (#30). */
export function hasLichessToken(): boolean {
  return !!process.env.LICHESS_TOKEN?.trim();
}

/**
 * Lichess rate-limits clients and answers bursts with 429, which asks for a
 * full minute of quiet. Spell that out in the error so the model waits instead
 * of retrying immediately and making it worse (#83).
 */
export function rateLimitHint(status: number): string {
  return status === 429
    ? " (rate limited — wait about a minute before calling Lichess tools again)"
    : "";
}

/** Build the tagged error for a non-OK lichess.org response, hint included. */
function lichessError(response: Response, url: string): LichessApiError {
  return new LichessApiError(
    response.status,
    `Lichess API error ${response.status}: ${response.statusText} for ${url}${rateLimitHint(response.status)}`,
  );
}

// Lichess documents "one request at a time" for lichess.org, but an MCP client
// may invoke several tools in parallel. Serialize all lichess.org requests —
// including body streaming — through a promise chain so parallel tool calls
// don't provoke 429s (#83). The separate explorer/tablebase *.lichess.ovh
// hosts are not subject to this rule and stay unserialized.
let lichessChain: Promise<unknown> = Promise.resolve();

/** Run `task` once every previously enqueued lichess.org request has settled. */
export function lichessSerialized<T>(task: () => Promise<T>): Promise<T> {
  const run = lichessChain.then(task, task);
  // Keep the chain alive regardless of this task's outcome.
  lichessChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function fetchJson<T>(path: string): Promise<T> {
  return lichessSerialized(async () => {
    const url = `${BASE_URL}${path}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        ...lichessAuthHeader(),
      },
      signal: AbortSignal.timeout(JSON_TIMEOUT_MS),
    });

    if (!response.ok) throw lichessError(response, url);

    return response.json() as Promise<T>;
  });
}

/**
 * Fetch a raw text body (e.g. PGN) with an explicit Accept header. Game/export
 * endpoints return PGN when asked via content negotiation (#46); the size cap is
 * applied by the caller's formatter (capText) so this stays a thin transport.
 */
function fetchText(path: string, accept: string): Promise<string> {
  return lichessSerialized(async () => {
    const url = `${BASE_URL}${path}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: accept,
        ...lichessAuthHeader(),
      },
      signal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
    });

    if (!response.ok) throw lichessError(response, url);

    return response.text();
  });
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
 * Count complete (newline-terminated), non-blank lines in an NDJSON buffer.
 * The tail after the last newline is still arriving and doesn't count. Blank
 * lines are excluded because parseNdjson skips them — counting raw newlines
 * could cancel the stream before maxLines parseable records arrived (#86).
 */
export function countCompleteNdjsonLines(buffer: string): number {
  const segments = buffer.split("\n");
  segments.pop();
  return segments.filter((line) => line.trim() !== "").length;
}

/**
 * Stream an NDJSON endpoint. When maxLines is set, stop reading (and abort the
 * request) once that many lines have arrived, so unbounded endpoints (e.g. team
 * members) cannot buffer hundreds of MB into memory.
 */
function fetchNdjson<T>(path: string, maxLines?: number): Promise<T[]> {
  return lichessSerialized(async () => {
    const url = `${BASE_URL}${path}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/x-ndjson",
        ...lichessAuthHeader(),
      },
      signal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
    });

    if (!response.ok) throw lichessError(response, url);

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
      if (countCompleteNdjsonLines(buffer) >= maxLines) {
        await reader.cancel();
        break;
      }
    }
    buffer += decoder.decode();
    return parseNdjson<T>(buffer, maxLines);
  });
}

/**
 * Fetch a raw text body (e.g. PGN) but stop and abort once maxChars have
 * arrived. Tournament game exports are unbounded (a whole event), so this caps
 * the *download*, not just the displayed output, keeping memory bounded.
 */
function fetchTextBounded(
  path: string,
  accept: string,
  maxChars: number,
): Promise<string> {
  return lichessSerialized(async () => {
    const url = `${BASE_URL}${path}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: accept,
        ...lichessAuthHeader(),
      },
      signal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
    });

    if (!response.ok) throw lichessError(response, url);

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
  });
}

/**
 * POST a plain-text body (a comma-separated ID list) and return the raw text
 * response with the requested Accept type. Used by the bulk endpoints (#43),
 * which take the IDs in the request body and content-negotiate JSON/NDJSON/PGN.
 */
function postText(path: string, body: string, accept: string): Promise<string> {
  return lichessSerialized(async () => {
    const url = `${BASE_URL}${path}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: accept,
        "Content-Type": "text/plain",
        ...lichessAuthHeader(),
      },
      body,
      signal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
    });

    if (!response.ok) throw lichessError(response, url);

    return response.text();
  });
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

export interface NextPuzzleOptions {
  // The query param is "angle": a puzzle theme key or an opening.
  angle?: string;
  difficulty?: string;
  color?: string;
}

// Exposed so the optional-filter wiring (#61) is unit-testable without a network
// call: only the provided params appear, and they are URL-encoded.
export function nextPuzzlePath(opts: NextPuzzleOptions): string {
  const q = new URLSearchParams();
  if (opts.angle) q.set("angle", opts.angle);
  if (opts.difficulty) q.set("difficulty", opts.difficulty);
  if (opts.color) q.set("color", opts.color);
  const qs = q.toString();
  return qs ? `/api/puzzle/next?${qs}` : "/api/puzzle/next";
}

// Public next-puzzle endpoint: anonymous callers get a random puzzle (difficulty
// relative to a 1500 rating). fetchJson attaches LICHESS_TOKEN when configured,
// which personalizes the result (unseen puzzles, rating-relative difficulty).
export function getNextPuzzle(opts: NextPuzzleOptions): Promise<LichessPuzzle> {
  return fetchJson(nextPuzzlePath(opts));
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

// /api/team/all returns the same paginated JSON wrapper as /api/team/search
// (#58): a single page of teams plus the page cursor, not a stream.
export interface PaginatedTeams {
  currentPage?: number;
  maxPerPage?: number;
  nbPages?: number;
  nbResults?: number;
  currentPageResults?: LichessTeam[];
}

export function getPopularTeams(page: number = 1): Promise<PaginatedTeams> {
  return fetchJson(`/api/team/all?page=${page}`);
}

// An Arena tournament as it appears in the /api/team/{id}/arena stream. Differs
// from the Swiss shape: the display name is `fullName` and `status` is a numeric
// code (see ARENA_STATUS in tools/lichess.ts), not a string.
export interface ArenaTournament {
  id: string;
  fullName: string;
  status: number;
  startsAt?: number | string;
  nbPlayers?: number;
  variant?: unknown;
}

// Both /swiss and /arena stream NDJSON with no server-side cap, so bound them
// like the other team/tournament streams (cf. TEAM_MEMBERS_MAX). The user-facing
// `max` query is clamped to this in the tool schema.
const TEAM_TOURNAMENTS_MAX = 100;

export function getTeamSwissTournaments(
  teamId: string,
  max: number = 30,
): Promise<SwissInfo[]> {
  return fetchNdjson(
    `/api/team/${encodeURIComponent(teamId)}/swiss?max=${max}`,
    TEAM_TOURNAMENTS_MAX,
  );
}

export function getTeamArenaTournaments(
  teamId: string,
  max: number = 30,
): Promise<ArenaTournament[]> {
  return fetchNdjson(
    `/api/team/${encodeURIComponent(teamId)}/arena?max=${max}`,
    TEAM_TOURNAMENTS_MAX,
  );
}

// /api/team/of is OAuth-only; the lichess_get_user_teams tool is registered
// only when a LICHESS_TOKEN is configured (#30), which lichessAuthHeader() then
// attaches to this request.
export function getUserTeams(username: string): Promise<LichessTeam[]> {
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

// Swiss TRF(x) export (#63): the FIDE-standard pairing format consumed by
// external tools. Note the path has NO /api prefix (unlike the other swiss
// endpoints) — it is served at lichess.org/swiss/{id}.trf. A whole event can be
// large, so bound the download like the game exports.
export function getSwissTrf(id: string): Promise<string> {
  return fetchTextBounded(
    `/swiss/${encodeURIComponent(id)}.trf`,
    "text/plain",
    TOURNEY_PGN_MAX_CHARS,
  );
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

// Team-battle per-team standings (#62). Each team carries its rank, total score,
// and a leaderboard subset of its top players (player.score is optional per spec).
export interface TeamBattlePlayer {
  user: { id: string; name: string; title?: string };
  score?: number;
}

export interface TeamBattleTeam {
  rank: number;
  id: string;
  score: number;
  players: TeamBattlePlayer[];
}

export interface TournamentTeamStandings {
  id: string;
  teams: TeamBattleTeam[];
}

// A non-team-battle arena returns HTTP 200 with a literal JSON `null` body (not
// 404, not an empty object), so the parsed result is nullable — the formatter
// turns that into a clear "not a team battle" message. An unknown id 404s and
// surfaces as a tagged error through call().
export function getTournamentTeams(
  id: string,
): Promise<TournamentTeamStandings | null> {
  return fetchJson(`/api/tournament/${encodeURIComponent(id)}/teams`);
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

// Structured broadcast metadata (#59). The index types above (BroadcastEntry)
// carry only a thin tour/round; these richer shapes back the by-id tools.
export interface BroadcastRoundInfo {
  id: string;
  name: string;
  slug?: string;
  url?: string;
  createdAt?: number;
  rated?: boolean;
  ongoing?: boolean;
  finished?: boolean;
  startsAt?: number;
  finishedAt?: number;
}

export interface BroadcastTourInfo {
  id: string;
  name: string;
  slug?: string;
  url?: string;
  createdAt?: number;
  tier?: number;
  description?: string;
  dates?: number[];
  info?: {
    format?: string;
    tc?: string;
    location?: string;
    players?: string;
    website?: string;
  };
}

// GET /api/broadcast/{id}: tournament info plus its rounds. Per the OpenAPI spec
// only `tour` and `rounds` are guaranteed; defaultRoundId/group are optional.
export interface BroadcastTournament {
  tour: BroadcastTourInfo;
  rounds: BroadcastRoundInfo[];
  defaultRoundId?: string;
  group?: { id: string; name: string };
}

export function getBroadcast(
  tournamentId: string,
): Promise<BroadcastTournament> {
  return fetchJson(`/api/broadcast/${encodeURIComponent(tournamentId)}`);
}

// One board within a round; players are an inline array, both optional.
export interface BroadcastGamePlayer {
  name?: string;
  title?: string;
  rating?: number;
  fideId?: number;
  fed?: string;
}

export interface BroadcastGame {
  id: string;
  name: string;
  fen?: string;
  players?: BroadcastGamePlayer[];
  lastMove?: string;
  // Result enum: "*" (ongoing), "1-0", "0-1", or the "½-½" glyph for a draw.
  status?: string;
}

// GET /api/broadcast/{tourSlug}/{roundSlug}/{roundId}: a single round as JSON.
export interface BroadcastRound {
  round: BroadcastRoundInfo;
  tour: BroadcastTourInfo;
  games: BroadcastGame[];
}

// The two slug segments are SEO-only — the spec states they can be replaced by
// "-", and only the round id is used (berserk builds the same "-/-/{id}" path).
// So this mirrors getBroadcastRoundPgn and takes just the round id.
export function getBroadcastRound(roundId: string): Promise<BroadcastRound> {
  return fetchJson(`/api/broadcast/-/-/${encodeURIComponent(roundId)}`);
}

// All rounds' games as one PGN. A whole tournament can be large, so bound the
// download like the Swiss/Arena game exports rather than buffering it all.
export function getBroadcastPgn(tournamentId: string): Promise<string> {
  return fetchTextBounded(
    `/api/broadcast/${encodeURIComponent(tournamentId)}.pgn`,
    TOURNEY_PGN_MEDIA_TYPE,
    TOURNEY_PGN_MAX_CHARS,
  );
}

// ─── Opening Explorer ──────────────────────────────────────────────

// The Opening Explorer lives on a separate host. The masters/lichess dbs
// return a single JSON object; the player db streams NDJSON (progressive
// results while indexing). Reading to completion and taking the last JSON line
// works for both. Public, no auth.
const EXPLORER_BASE = "https://explorer.lichess.ovh";

/**
 * The explorer/tablebase *.lichess.ovh hosts take no auth, yet reject some
 * client IPs (datacenter/VPN ranges) with 401/403. Spell that out in the error
 * message — a bare 401 reads as a token problem, which it never is here since
 * no Authorization header is sent to these hosts.
 */
export function ovhHostErrorHint(status: number): string {
  return status === 401 || status === 403
    ? " (this host takes no auth and none was sent — it rejects some IPs, e.g. datacenter/VPN ranges; try from a different network)"
    : "";
}

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
      `Lichess API error ${response.status}: ${response.statusText} for ${url}${ovhHostErrorHint(response.status)}${rateLimitHint(response.status)}`,
    );
  }

  // Take the last non-empty JSON line: one line for masters/lichess, the final
  // (fully indexed) line for the player db's progressive NDJSON stream.
  const body = await response.text();
  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  // An empty 200 body would parse to "{}" and render as NaN totals downstream;
  // surface it as a tagged error instead.
  if (lines.length === 0) {
    throw new LichessApiError(
      502,
      `Empty response from Opening Explorer (${url})`,
    );
  }
  return JSON.parse(lines[lines.length - 1]) as ExplorerResult;
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

// Raw-text sibling of fetchExplorer for the masters game PGN (#60). Same host,
// no auth — distinct from fetchText, which targets the main API + attaches the
// OAuth header.
async function fetchExplorerText(path: string): Promise<string> {
  const url = `${EXPLORER_BASE}${path}`;
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: PGN_MEDIA_TYPE },
    signal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new LichessApiError(
      response.status,
      `Lichess API error ${response.status}: ${response.statusText} for ${url}${ovhHostErrorHint(response.status)}${rateLimitHint(response.status)}`,
    );
  }

  return response.text();
}

// The masters db references OTB games and serves each one's PGN here. A single
// game is small, so the caller display-caps rather than stream-bounds it.
export function getMastersGamePgn(gameId: string): Promise<string> {
  return fetchExplorerText(`/masters/pgn/${encodeURIComponent(gameId)}`);
}

// ─── Tablebase ─────────────────────────────────────────────────────

// Endgame tablebase lives on a separate host. Public, no auth, up to 7 pieces.
const TABLEBASE_BASE = "https://tablebase.lichess.ovh";

export interface TablebaseMove {
  uci: string;
  san: string;
  category?: string;
  dtz?: number | null;
  dtm?: number | null;
  zeroing?: boolean;
  checkmate?: boolean;
  stalemate?: boolean;
}

export interface TablebaseResult {
  category?: string;
  dtz?: number | null;
  precise_dtz?: number | null;
  dtm?: number | null;
  checkmate?: boolean;
  stalemate?: boolean;
  insufficient_material?: boolean;
  variant_win?: boolean;
  variant_loss?: boolean;
  moves: TablebaseMove[];
}

export async function tablebaseLookup(
  variant: "standard" | "atomic" | "antichess",
  fen: string,
): Promise<TablebaseResult> {
  const url = `${TABLEBASE_BASE}/${variant}?fen=${encodeURIComponent(fen)}`;
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(JSON_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new LichessApiError(
      response.status,
      `Lichess API error ${response.status}: ${response.statusText} for ${url}${ovhHostErrorHint(response.status)}${rateLimitHint(response.status)}`,
    );
  }
  return response.json() as Promise<TablebaseResult>;
}
