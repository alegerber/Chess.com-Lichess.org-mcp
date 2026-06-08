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
  assert.equal(tools.length, 57);
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

// Lichess made GET /api/team/of OAuth-only (security: - OAuth2: []), so this
// auth-less server can never satisfy it. Interim: flag the requirement in the
// description and return a clear error instead of a doomed request (#31).
test("lichess_get_user_teams is flagged auth-required and returns an explanatory error (#31)", async () => {
  const client = await connectedClient();

  // The description flags the OAuth requirement before the tool is ever called.
  const { tools } = await client.listTools();
  const tool = tools.find((t) => t.name === "lichess_get_user_teams");
  assert.ok(tool, "lichess_get_user_teams is registered");
  assert.match(tool.description ?? "", /oauth|token/i, "description flags auth");

  // Calling it returns a clear isError message (no network round-trip).
  const res = await client.callTool({
    name: "lichess_get_user_teams",
    arguments: { username: "anyone" },
  });
  const content = (res.content ?? []) as Array<{ type: string; text?: string }>;
  const body = content
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n");
  assert.equal(res.isError, true);
  assert.match(body, /oauth|token|unavailable/i);
  // Points users to the public alternatives that still work.
  assert.match(body, /lichess_search_teams|lichess_get_team_members/);

  await client.close();
});
