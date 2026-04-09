# AGENTS.md

## Project Overview

This is an MCP (Model Context Protocol) server that exposes the Chess.com and Lichess public APIs as tools for LLMs. It communicates over stdio using JSON-RPC and is designed to run locally via Node.js.

## Architecture

```
src/
├── index.ts          # MCP server entry point — registers all tools, starts stdio transport
├── chess-api.ts      # Chess.com API client — typed fetch wrappers for all public endpoints
└── lichess-api.ts    # Lichess API client — typed fetch wrappers (JSON + NDJSON support)
```

- **`index.ts`** is the single entry point. It creates an `McpServer` instance, registers 52 tools (28 Chess.com + 24 Lichess), and connects via `StdioServerTransport`.
- **`chess-api.ts`** wraps the Chess.com Published-Data API (`https://api.chess.com/pub/...`). All responses are JSON.
- **`lichess-api.ts`** wraps the Lichess API (`https://lichess.org/api/...`). Some endpoints return NDJSON (newline-delimited JSON) — these are handled by `fetchNdjson()` which parses line-by-line.

There is no database, no authentication, and no state between requests. Every tool call makes a fresh HTTP request to the upstream API.

## Tech Stack

- **Runtime**: Node.js 22
- **Language**: TypeScript (strict mode, ES2022 target, Node16 module resolution)
- **MCP SDK**: `@modelcontextprotocol/sdk` v1.x (`McpServer` + `StdioServerTransport`)
- **Validation**: Zod v4 (used for tool input schemas)
- **Linting**: ESLint v10 flat config + typescript-eslint + Prettier integration

## Key Commands

```bash
npm install          # Install all dependencies
npm run build        # Compile TypeScript to dist/
npm run lint         # Check for lint errors
npm run lint:fix     # Auto-fix lint/formatting issues
npm start            # Run the MCP server locally (stdio)
```

## Adding a New Tool

1. **Add the API function** in `chess-api.ts` or `lichess-api.ts`:
   - Use `fetchApi<T>(path)` for JSON endpoints (Chess.com)
   - Use `fetchJson<T>(path)` for JSON endpoints (Lichess)
   - Use `fetchNdjson<T>(path)` for NDJSON streaming endpoints (Lichess)
   - Define a TypeScript interface for the response when the shape is known

2. **Register the tool** in `index.ts` using `server.registerTool()`:
   - First arg: tool name (snake_case, prefix Lichess tools with `lichess_`)
   - Second arg: metadata object with `title`, `description`, and `inputSchema` (Zod schemas)
   - Third arg: async handler that calls the API function and returns `{ content: [{ type: "text", text: "..." }] }`

3. **Run lint and build** to verify:
   ```bash
   npm run lint:fix && npm run build
   ```

## Naming Conventions

- Chess.com tools: plain snake_case (e.g. `get_player_profile`, `get_daily_puzzle`)
- Lichess tools: prefixed with `lichess_` (e.g. `lichess_get_user`, `lichess_get_daily_puzzle`)
- API client functions: camelCase matching the endpoint purpose (e.g. `getPlayerProfile`, `getUserGames`)
- Interfaces: PascalCase (e.g. `PlayerProfile`, `LichessUser`)

## Code Style

- Enforced by ESLint + Prettier (run `npm run lint:fix` before committing)
- Double quotes, semicolons, trailing commas, 80-char line width
- Unused variables prefixed with `_` are allowed
- `@typescript-eslint/no-explicit-any` is set to warn

## External APIs

### Chess.com

- Base URL: `https://api.chess.com/pub`
- Docs: https://www.chess.com/news/view/published-data-api
- Auth: None required
- Format: JSON
- Rate limits: Unlimited serial; parallel requests may get 429
- Timestamps: Unix seconds

### Lichess

- Base URL: `https://lichess.org`
- Docs: https://lichess.org/api
- Auth: None required for public endpoints
- Format: JSON or NDJSON (depends on endpoint; set `Accept` header accordingly)
- Rate limits: One request at a time; 429 means wait ~1 minute
- Timestamps: Unix milliseconds
- Note: Game export path is `/game/export/{id}` (no `/api/` prefix)

## Testing

There are no unit tests. Verification is done by:

1. `npm run lint` — zero errors
2. `npm run build` — clean compilation
3. Manual MCP protocol test:
   ```bash
   echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' \
     | node dist/index.js
   ```
   Expected: JSON response with `serverInfo.name` = `"chess-com-lichess-org-mcp"` and `capabilities.tools`

## Claude Desktop Integration

The server is configured in `~/Library/Application Support/Claude/claude_desktop_config.json` under the `chess-com` MCP server entry, running via Node.js.
