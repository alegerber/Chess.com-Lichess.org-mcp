const BASE_URL = "https://api.chess.com/pub";

const USER_AGENT =
  "chess-com-lichess-org-mcp/1.0.0 (MCP Server; https://github.com/chess-com-lichess-org-mcp)";

export class ChessComApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ChessComApiError";
  }
}

async function fetchApi<T>(path: string): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new ChessComApiError(
      response.status,
      `Chess.com API error ${response.status}: ${response.statusText} for ${url}`,
    );
  }

  return response.json() as Promise<T>;
}

// ─── Player endpoints ──────────────────────────────────────────────

export interface PlayerProfile {
  "@id": string;
  url: string;
  username: string;
  player_id: number;
  title?: string;
  status: string;
  name?: string;
  avatar?: string;
  location?: string;
  country: string;
  joined: number;
  last_online: number;
  followers: number;
  is_streamer?: boolean;
  twitch_url?: string;
  fide?: number;
}

export function getPlayerProfile(username: string): Promise<PlayerProfile> {
  return fetchApi(`/player/${encodeURIComponent(username.toLowerCase())}`);
}

export interface PlayerStats {
  [key: string]: unknown;
}

export function getPlayerStats(username: string): Promise<PlayerStats> {
  return fetchApi(
    `/player/${encodeURIComponent(username.toLowerCase())}/stats`,
  );
}

export interface PlayerOnlineStatus {
  online: boolean;
}

export function getPlayerOnlineStatus(
  username: string,
): Promise<PlayerOnlineStatus> {
  return fetchApi(
    `/player/${encodeURIComponent(username.toLowerCase())}/is-online`,
  );
}

// ─── Player games endpoints ────────────────────────────────────────

export interface CurrentDailyGames {
  games: unknown[];
}

export function getCurrentDailyGames(
  username: string,
): Promise<CurrentDailyGames> {
  return fetchApi(
    `/player/${encodeURIComponent(username.toLowerCase())}/games`,
  );
}

export interface GamesToMove {
  games: unknown[];
}

export function getGamesToMove(username: string): Promise<GamesToMove> {
  return fetchApi(
    `/player/${encodeURIComponent(username.toLowerCase())}/games/to-move`,
  );
}

export interface GameArchives {
  archives: string[];
}

export function getGameArchives(username: string): Promise<GameArchives> {
  return fetchApi(
    `/player/${encodeURIComponent(username.toLowerCase())}/games/archives`,
  );
}

export interface MonthlyArchive {
  games: unknown[];
}

export function getMonthlyArchive(
  username: string,
  year: number,
  month: number,
): Promise<MonthlyArchive> {
  const mm = String(month).padStart(2, "0");
  return fetchApi(
    `/player/${encodeURIComponent(username.toLowerCase())}/games/${year}/${mm}`,
  );
}

// ─── Player participation endpoints ────────────────────────────────

export interface PlayerClubs {
  clubs: unknown[];
}

export function getPlayerClubs(username: string): Promise<PlayerClubs> {
  return fetchApi(
    `/player/${encodeURIComponent(username.toLowerCase())}/clubs`,
  );
}

export interface PlayerTournaments {
  finished: unknown[];
  in_progress: unknown[];
  registered: unknown[];
}

export function getPlayerTournaments(
  username: string,
): Promise<PlayerTournaments> {
  return fetchApi(
    `/player/${encodeURIComponent(username.toLowerCase())}/tournaments`,
  );
}

export interface PlayerMatches {
  finished: unknown[];
  in_progress: unknown[];
  registered: unknown[];
}

export function getPlayerMatches(username: string): Promise<PlayerMatches> {
  return fetchApi(
    `/player/${encodeURIComponent(username.toLowerCase())}/matches`,
  );
}

// ─── Titled players endpoint ───────────────────────────────────────

export interface TitledPlayers {
  players: string[];
}

export function getTitledPlayers(title: string): Promise<TitledPlayers> {
  return fetchApi(`/titled/${encodeURIComponent(title.toUpperCase())}`);
}

// ─── Club endpoints ────────────────────────────────────────────────

export interface ClubProfile {
  "@id": string;
  name: string;
  club_id: number;
  icon?: string;
  country: string;
  average_daily_rating: number;
  members_count: number;
  created: number;
  last_activity: number;
  visibility: string;
  join_request: string;
  admin: string[];
  description: string;
}

export function getClubProfile(urlId: string): Promise<ClubProfile> {
  return fetchApi(`/club/${encodeURIComponent(urlId)}`);
}

export interface ClubMembers {
  weekly: unknown[];
  monthly: unknown[];
  all_time: unknown[];
}

export function getClubMembers(urlId: string): Promise<ClubMembers> {
  return fetchApi(`/club/${encodeURIComponent(urlId)}/members`);
}

export interface ClubMatches {
  finished: unknown[];
  in_progress: unknown[];
  registered: unknown[];
}

export function getClubMatches(urlId: string): Promise<ClubMatches> {
  return fetchApi(`/club/${encodeURIComponent(urlId)}/matches`);
}

// ─── Tournament endpoints ──────────────────────────────────────────

export interface TournamentProfile {
  name: string;
  url: string;
  description: string;
  creator: string;
  status: string;
  finish_time?: number;
  settings: unknown;
  players: unknown[];
  rounds: string[];
}

export function getTournamentProfile(
  urlId: string,
): Promise<TournamentProfile> {
  return fetchApi(`/tournament/${encodeURIComponent(urlId)}`);
}

export interface TournamentRound {
  groups: string[];
  players: unknown[];
}

export function getTournamentRound(
  urlId: string,
  round: number,
): Promise<TournamentRound> {
  return fetchApi(`/tournament/${encodeURIComponent(urlId)}/${round}`);
}

export interface TournamentRoundGroup {
  fair_play_removals: string[];
  games: unknown[];
  players: unknown[];
}

export function getTournamentRoundGroup(
  urlId: string,
  round: number,
  group: number,
): Promise<TournamentRoundGroup> {
  return fetchApi(`/tournament/${encodeURIComponent(urlId)}/${round}/${group}`);
}

// ─── Team match endpoints ──────────────────────────────────────────

export function getTeamMatch(matchId: number): Promise<unknown> {
  return fetchApi(`/match/${matchId}`);
}

export function getTeamMatchBoard(
  matchId: number,
  board: number,
): Promise<unknown> {
  return fetchApi(`/match/${matchId}/${board}`);
}

export function getLiveTeamMatch(matchId: number): Promise<unknown> {
  return fetchApi(`/match/live/${matchId}`);
}

export function getLiveTeamMatchBoard(
  matchId: number,
  board: number,
): Promise<unknown> {
  return fetchApi(`/match/live/${matchId}/${board}`);
}

// ─── Country endpoints ─────────────────────────────────────────────

export interface CountryProfile {
  "@id": string;
  name: string;
  code: string;
}

export function getCountryProfile(isoCode: string): Promise<CountryProfile> {
  return fetchApi(`/country/${encodeURIComponent(isoCode.toUpperCase())}`);
}

export interface CountryPlayers {
  players: string[];
}

export function getCountryPlayers(isoCode: string): Promise<CountryPlayers> {
  return fetchApi(
    `/country/${encodeURIComponent(isoCode.toUpperCase())}/players`,
  );
}

export interface CountryClubs {
  clubs: string[];
}

export function getCountryClubs(isoCode: string): Promise<CountryClubs> {
  return fetchApi(
    `/country/${encodeURIComponent(isoCode.toUpperCase())}/clubs`,
  );
}

// ─── Daily puzzle endpoints ────────────────────────────────────────

export interface DailyPuzzle {
  title: string;
  url: string;
  publish_time: number;
  fen: string;
  pgn: string;
  image: string;
}

export function getDailyPuzzle(): Promise<DailyPuzzle> {
  return fetchApi("/puzzle");
}

export function getRandomPuzzle(): Promise<DailyPuzzle> {
  return fetchApi("/puzzle/random");
}

// ─── Streamers endpoint ────────────────────────────────────────────

export interface Streamers {
  streamers: unknown[];
}

export function getStreamers(): Promise<Streamers> {
  return fetchApi("/streamers");
}

// ─── Leaderboards endpoint ─────────────────────────────────────────

export function getLeaderboards(): Promise<unknown> {
  return fetchApi("/leaderboards");
}
