import { test } from "node:test";
import assert from "node:assert/strict";
import * as api from "../src/chess-api.js";
import * as chessTools from "../src/tools/chess.js";

// Fixed reference instant (ms) so tests are deterministic without mocking Date.
const NOW_MS = 1_000_000_000_000;
const NOW_S = NOW_MS / 1000;

// ─── H1: is_player_online derived from profile.last_online ──────────

test("formatOnlineStatus reports online within the 5-minute window", () => {
  const lastOnline = NOW_S - 60; // 1 minute ago
  assert.equal(
    chessTools.formatOnlineStatus("hikaru", lastOnline, NOW_MS),
    "hikaru is online",
  );
});

test("formatOnlineStatus treats the exact 5-minute edge as offline", () => {
  const lastOnline = NOW_S - 300; // exactly the window
  assert.match(
    chessTools.formatOnlineStatus("hikaru", lastOnline, NOW_MS),
    /offline/,
  );
});

test("formatOnlineStatus reports offline with a last-seen timestamp beyond the window", () => {
  const lastOnline = NOW_S - 3600; // 1 hour ago
  const out = chessTools.formatOnlineStatus("hikaru", lastOnline, NOW_MS);
  assert.match(out, /hikaru is offline/);
  assert.match(out, /\(last online \d{4}-\d{2}-\d{2}T[\d:.]+Z\)/);
});

test("formatOnlineStatus reports plain offline when last_online is missing", () => {
  const out = chessTools.formatOnlineStatus(
    "ghost",
    undefined as unknown as number,
    NOW_MS,
  );
  assert.equal(out, "ghost is offline");
});

test("the dead getPlayerOnlineStatus endpoint is removed", () => {
  assert.equal(
    (api as Record<string, unknown>).getPlayerOnlineStatus,
    undefined,
  );
});
