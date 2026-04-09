#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerChessTools } from "./tools/chess.js";
import { registerLichessTools } from "./tools/lichess.js";

const server = new McpServer({
  name: "chess-com-lichess-org-mcp",
  version: "1.0.0",
});

registerChessTools(server);
registerLichessTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error starting server:", error);
  process.exit(1);
});
