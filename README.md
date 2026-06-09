# chess-com-lichess-org-mcp

An MCP (Model Context Protocol) server that provides access to the [Chess.com Published-Data API](https://www.chess.com/news/view/published-data-api) and the [Lichess API](https://lichess.org/api). This gives LLMs the ability to look up player profiles, game history, stats, clubs, tournaments, puzzles, leaderboards, and more from both platforms.

## Tools

### Chess.com (29 tools)

| Tool | Description |
|------|-------------|
| `get_player_profile` | Get a player's profile (username, title, FIDE, status, etc.) |
| `get_player_stats` | Get a player's ratings and win/loss/draw records across all game types |
| `is_player_online` | Check if a player is currently online |
| `get_current_daily_games` | Get daily chess games a player is currently playing |
| `get_games_to_move` | Get daily games where it's the player's turn |
| `get_game_archives` | List available monthly game archives for a player |
| `get_monthly_archives` | Get all games from a specific month |
| `get_monthly_archive_pgn` | Get a whole month of games as a single PGN document |
| `get_player_clubs` | Get clubs a player belongs to |
| `get_player_tournaments` | Get a player's tournament history |
| `get_player_matches` | Get a player's team match history |
| `get_titled_players` | List players with a specific title (GM, IM, FM, etc.); paginate with `offset`/`limit` |
| `get_club_profile` | Get a club's profile information |
| `get_club_members` | Get a club's members by activity level |
| `get_club_matches` | Get a club's team matches |
| `get_tournament` | Get tournament details |
| `get_tournament_round` | Get details about a tournament round |
| `get_tournament_round_group` | Get details about a tournament round group |
| `get_team_match` | Get daily team match details |
| `get_team_match_board` | Get a specific board from a daily team match |
| `get_live_team_match` | Get live team match details |
| `get_live_team_match_board` | Get a specific board from a live team match |
| `get_country_profile` | Get a country's profile |
| `get_country_players` | List players from a country; paginate with `offset`/`limit` |
| `get_country_clubs` | List clubs from a country; paginate with `offset`/`limit` |
| `get_daily_puzzle` | Get today's daily puzzle |
| `get_random_puzzle` | Get a random puzzle |
| `get_streamers` | List Chess.com streamers |
| `get_leaderboards` | Get leaderboards for all game types |

### Lichess (53 tools, +1 with `LICHESS_TOKEN`)

| Tool | Description |
|------|-------------|
| `lichess_get_user` | Get a user's profile, ratings across all variants, game counts, and bio |
| `lichess_get_user_status` | Check if users are online, playing, or streaming (up to 100) |
| `lichess_get_rating_history` | Get rating history across all variants with daily data points |
| `lichess_get_perf_stats` | Get detailed performance stats: best wins, worst losses, streaks |
| `lichess_get_user_activity` | Get recent activity: games, tournaments, practice, etc. |
| `lichess_get_user_games` | Get recent games with optional filters (rated, variant, color); `format: pgn` for raw PGN |
| `lichess_get_game` | Get a specific game by its 8-character ID; `format: pgn` for raw PGN |
| `lichess_get_current_game` | Get a user's current ongoing game or last played game |
| `lichess_get_leaderboards` | Get top 10 players across all variants |
| `lichess_get_leaderboard` | Get top N players for a specific variant/speed |
| `lichess_get_daily_puzzle` | Get today's daily puzzle with solution and themes |
| `lichess_get_puzzle` | Get a specific puzzle by ID |
| `lichess_get_next_puzzle` | Get a fresh puzzle, optionally by theme/difficulty |
| `lichess_get_storm_dashboard` | Get a user's Puzzle Storm statistics |
| `lichess_get_team` | Get a team's profile, description, and member count |
| `lichess_search_teams` | Search for teams by name |
| `lichess_get_user_teams` | Get all teams a user is a member of — _registered only when [`LICHESS_TOKEN`](#optional-lichess-oauth-token) is set, since `/api/team/of` is OAuth-only_ |
| `lichess_get_team_members` | Get the members of a Lichess team |
| `lichess_get_popular_teams` | List the most popular teams (paginated) |
| `lichess_get_team_swiss_tournaments` | List a team's Swiss tournaments |
| `lichess_get_team_arena_tournaments` | List a team's Arena tournaments |
| `lichess_get_current_tournaments` | Get the current tournament schedule |
| `lichess_get_tournament` | Get details about a specific arena tournament |
| `lichess_get_user_tournaments` | Get tournaments a user has played in |
| `lichess_get_tv_channels` | Get the featured game on each TV channel |
| `lichess_get_tv_games` | Get best ongoing games from a specific TV channel |
| `lichess_get_streamers` | Get currently live streamers on Twitch and YouTube |
| `lichess_get_crosstable` | Get head-to-head record between two users |
| `lichess_get_cloud_eval` | Get cloud engine evaluation for a FEN position |
| `lichess_get_fide_player` | Look up a FIDE player by numeric ID (name, federation, title, ratings) |
| `lichess_search_fide_players` | Search FIDE players by name |
| `lichess_autocomplete_players` | Resolve/disambiguate Lichess usernames from a partial term |
| `lichess_export_games_by_ids` | Export many games at once by ID list (JSON or PGN) |
| `lichess_get_users` | Fetch many users at once by username list (compact summary) |
| `lichess_get_swiss` | Get a Swiss tournament's info (status, rounds, clock, players) |
| `lichess_get_swiss_results` | Get a Swiss tournament's final standings (top 100) |
| `lichess_get_swiss_games` | Export a Swiss tournament's games (JSON or PGN) |
| `lichess_get_tournament_results` | Get an Arena tournament's final standings (top 100) |
| `lichess_get_tournament_teams` | Get a team-battle Arena's per-team standings |
| `lichess_get_tournament_games` | Export an Arena tournament's games (JSON or PGN) |
| `lichess_get_simuls` | List current simultaneous exhibitions (simuls) |
| `lichess_get_user_studies` | List a user's public studies (metadata) |
| `lichess_export_study_pgn` | Export a whole public study as PGN (all chapters) |
| `lichess_export_study_chapter_pgn` | Export a single study chapter as PGN |
| `lichess_get_broadcasts` | List official broadcasts (live tournament relays) |
| `lichess_get_top_broadcasts` | List featured broadcasts (active/upcoming/past) |
| `lichess_get_broadcasts_by_user` | List broadcasts created by a user |
| `lichess_get_broadcast` | Get a broadcast tournament's metadata and rounds |
| `lichess_get_broadcast_round` | Get a broadcast round's games/players as JSON |
| `lichess_get_broadcast_round_pgn` | Get a broadcast round's live PGN feed |
| `lichess_get_broadcast_pgn` | Get a whole broadcast tournament as a single PGN |
| `lichess_opening_explorer` | Look up a position in the Opening Explorer (masters/lichess/player) |
| `lichess_get_masters_game_pgn` | Get the PGN of an OTB master game from the Opening Explorer |
| `lichess_tablebase` | Endgame tablebase lookup (WDL/DTZ/DTM) for a FEN (standard/atomic/antichess) |

## Install

No clone or build required — run the published package with `npx`.

### Claude Code

```bash
claude mcp add chess-mcp -- npx -y chess-com-lichess-org-mcp
```

### Claude Desktop

Add the following to your config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "chess-mcp": {
      "command": "npx",
      "args": ["-y", "chess-com-lichess-org-mcp"]
    }
  }
}
```

### From source (development)

```bash
npm install
npm run build
```

Then point the MCP config at the built entry point — `command: node`, `args: ["/absolute/path/to/chess-com-lichess-org-mcp/dist/index.js"]`.

### Optional: Lichess OAuth token

The server is **zero-config and auth-less by default** — every tool above (except one) hits public endpoints and needs no login.

A few Lichess endpoints are OAuth-only. To enable the tools that need them, set a `LICHESS_TOKEN` environment variable to a [Lichess personal access token](https://lichess.org/account/oauth/token) (no scopes required for `/api/team/of`):

```json
{
  "mcpServers": {
    "chess-mcp": {
      "command": "npx",
      "args": ["-y", "chess-com-lichess-org-mcp"],
      "env": { "LICHESS_TOKEN": "lip_xxxxxxxxxxxx" }
    }
  }
}
```

- When set, the token is sent as `Authorization: Bearer <token>` **only on `lichess.org` requests** (never to the separate Opening Explorer / Tablebase hosts), and `lichess_get_user_teams` is registered.
- When unset, behavior is unchanged: the token-only tool is simply absent from the tool list, and all public tools work as before.

## Usage examples

Once configured, you can ask your LLM things like:

**Chess.com:**
- "What is Hikaru's Chess.com rating?"
- "Show me Magnus Carlsen's recent blitz games on Chess.com"
- "Who are the top players on the Chess.com leaderboard?"
- "Get today's Chess.com daily puzzle"
- "List all Grandmasters on Chess.com"

**Lichess:**
- "Show me DrNykterstein's Lichess profile"
- "What's the head-to-head record between DrNykterstein and Firouzja2003 on Lichess?"
- "Get the Lichess daily puzzle"
- "Who are the top bullet players on Lichess?"
- "What games are currently featured on Lichess TV?"
- "Get the cloud evaluation for this position: rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"

**Cross-platform:**
- "Compare Hikaru's ratings on Chess.com and Lichess"
- "Get today's daily puzzle from both Chess.com and Lichess"

## Notes

- Both APIs are read-only and free to use. No API keys are required.
- **Chess.com**: Rate limiting applies to parallel requests. Data may be cached for up to 12-24 hours.
- **Lichess**: Requests are serial (one at a time). A 429 response means you should wait ~1 minute. Game exports stream as NDJSON, or pass `format: pgn` to `lichess_get_game` / `lichess_get_user_games` for raw PGN ready for engine analysis.

## License

[MIT](LICENSE)
