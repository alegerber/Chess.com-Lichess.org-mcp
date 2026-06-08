import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";

// In-process: no child process, no network. Exercises real registration +
// the MCP handshake / tools/list output. createServer() reads LICHESS_TOKEN at
// build time to decide which tools to register (#30), so set/clear it around
// construction to keep tests deterministic regardless of the ambient env.
async function connectedClient(token?: string): Promise<Client> {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const prev = process.env.LICHESS_TOKEN;
  if (token === undefined) delete process.env.LICHESS_TOKEN;
  else process.env.LICHESS_TOKEN = token;
  let server: ReturnType<typeof createServer>;
  try {
    server = createServer();
  } finally {
    // The server captured its tool list synchronously; restore env immediately.
    if (prev === undefined) delete process.env.LICHESS_TOKEN;
    else process.env.LICHESS_TOKEN = prev;
  }
  const client = new Client({ name: "test", version: "1.0.0" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return client;
}

test("every tool is annotated read-only and open-world (L3)", async () => {
  // Default, token-less experience: the OAuth-only tool (#30) is omitted.
  const client = await connectedClient();
  const { tools } = await client.listTools();
  assert.equal(tools.length, 76);
  for (const t of tools) {
    assert.equal(t.annotations?.readOnlyHint, true, `${t.name}: readOnlyHint`);
    assert.equal(t.annotations?.openWorldHint, true, `${t.name}: openWorldHint`);
  }
  await client.close();
});

test("server exposes instructions (L4)", async () => {
  const client = await connectedClient();
  const instructions = client.getInstructions();
  assert.ok(instructions && instructions.length > 0, "instructions present");
  assert.match(instructions, /lichess_|read-only/i);
  await client.close();
});

// Lichess made GET /api/team/of OAuth-only (security: - OAuth2: []). Rather than
// ship a guaranteed-failing tool, we register it only when an optional
// LICHESS_TOKEN is configured (#30), keeping the zero-config default public-only.
test("lichess_get_user_teams is absent without a LICHESS_TOKEN (#30)", async () => {
  const client = await connectedClient(); // no token
  const { tools } = await client.listTools();
  assert.equal(tools.length, 76);
  assert.equal(
    tools.find((t) => t.name === "lichess_get_user_teams"),
    undefined,
    "OAuth-only tool is omitted when no token is configured",
  );
  await client.close();
});

test("lichess_get_user_teams is registered with a LICHESS_TOKEN (#30)", async () => {
  const client = await connectedClient("lip_test_token");
  const { tools } = await client.listTools();
  assert.equal(tools.length, 77);
  const tool = tools.find((t) => t.name === "lichess_get_user_teams");
  assert.ok(tool, "OAuth-only tool is registered when a token is present");
  assert.match(tool.description ?? "", /team/i);
  await client.close();
});
