# chess-com-mcp

An MCP (Model Context Protocol) server that provides access to the [Chess.com Published-Data API](https://www.chess.com/news/view/published-data-api). This gives LLMs the ability to look up player profiles, game history, stats, clubs, tournaments, puzzles, leaderboards, and more from Chess.com.

## Tools

| Tool | Description |
|------|-------------|
| `get_player_profile` | Get a player's profile (username, title, FIDE, status, etc.) |
| `get_player_stats` | Get a player's ratings and win/loss/draw records across all game types |
| `is_player_online` | Check if a player is currently online |
| `get_current_daily_games` | Get daily chess games a player is currently playing |
| `get_games_to_move` | Get daily games where it's the player's turn |
| `get_game_archives` | List available monthly game archives for a player |
| `get_monthly_archives` | Get all games from a specific month |
| `get_player_clubs` | Get clubs a player belongs to |
| `get_player_tournaments` | Get a player's tournament history |
| `get_player_matches` | Get a player's team match history |
| `get_titled_players` | List players with a specific title (GM, IM, FM, etc.) |
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
| `get_country_players` | List players from a country |
| `get_country_clubs` | List clubs from a country |
| `get_daily_puzzle` | Get today's daily puzzle |
| `get_random_puzzle` | Get a random puzzle |
| `get_streamers` | List Chess.com streamers |
| `get_leaderboards` | Get leaderboards for all game types |

## Setup

### Option 1: Local (Node.js)

```bash
npm install
npm run build
```

#### Configure in Claude Desktop

Add the following to your Claude Desktop MCP configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "chess-com": {
      "command": "node",
      "args": ["/absolute/path/to/chess-com-mcp/dist/index.js"]
    }
  }
}
```

#### Configure in Claude Code

```bash
claude mcp add chess-com node /absolute/path/to/chess-com-mcp/dist/index.js
```

### Option 2: Docker

#### Build the image

```bash
docker build -t chess-com-mcp .
```

Or using Docker Compose:

```bash
docker compose build
```

#### Configure in Claude Desktop (Docker)

```json
{
  "mcpServers": {
    "chess-com": {
      "command": "docker",
      "args": ["run", "--rm", "-i", "chess-com-mcp:latest"]
    }
  }
}
```

#### Configure in Claude Code (Docker)

```bash
claude mcp add chess-com docker run --rm -i chess-com-mcp:latest
```

#### Configure in Claude Desktop (Docker Compose)

```json
{
  "mcpServers": {
    "chess-com": {
      "command": "docker",
      "args": ["compose", "-f", "/absolute/path/to/chess-com-mcp/docker-compose.yml", "run", "--rm", "-T", "chess-com-mcp"]
    }
  }
}
```

## Usage examples

Once configured, you can ask your LLM things like:

- "What is Hikaru's Chess.com rating?"
- "Show me Magnus Carlsen's recent blitz games"
- "Who are the top players on the Chess.com leaderboard?"
- "Get today's daily puzzle"
- "Is GothamChess online right now?"
- "List all Grandmasters on Chess.com"
- "Show me the stats for player erik"

## Notes

- The Chess.com API is read-only and free to use. No API key is required.
- Rate limiting applies to parallel requests. The server makes serial requests so this should not be an issue under normal use.
- Data may be cached on Chess.com's side for up to 12-24 hours.

## License

ISC
