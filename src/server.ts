import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerChessTools } from "./tools/chess.js";
import { registerLichessTools } from "./tools/lichess.js";
import { VERSION } from "./version.js";

const INSTRUCTIONS = `Read-only access to the public Chess.com and Lichess APIs — player profiles, games, stats, puzzles, clubs, teams, tournaments, leaderboards, and more. No authentication is required and nothing is ever modified. Chess.com tools use plain names (e.g. get_player_profile); Lichess tools are prefixed with "lichess_" (e.g. lichess_get_user). Chess.com timestamps are in seconds, Lichess in milliseconds.`;

/** Build the MCP server with all tools registered. Shared by the entry point and tests. */
export function createServer(): McpServer {
  const server = new McpServer(
    { name: "chess-com-lichess-org-mcp", version: VERSION },
    { instructions: INSTRUCTIONS },
  );
  registerChessTools(server);
  registerLichessTools(server);
  return server;
}
