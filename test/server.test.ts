import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";

// In-process: no child process, no network. Exercises real registration +
// the MCP handshake / tools/list output.
async function connectedClient(): Promise<Client> {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const server = createServer();
  const client = new Client({ name: "test", version: "1.0.0" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return client;
}

test("every tool is annotated read-only and open-world (L3)", async () => {
  const client = await connectedClient();
  const { tools } = await client.listTools();
  assert.equal(tools.length, 53);
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
