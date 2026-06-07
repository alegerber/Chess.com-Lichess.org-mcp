#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerChessTools } from "./tools/chess.js";
import { registerLichessTools } from "./tools/lichess.js";
import { VERSION } from "./version.js";

const server = new McpServer({
  name: "chess-com-lichess-org-mcp",
  version: VERSION,
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
