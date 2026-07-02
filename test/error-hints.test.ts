import { test } from "node:test";
import assert from "node:assert/strict";
import { ovhHostErrorHint, rateLimitHint } from "../src/lichess-api.js";
import { streamersErrorHint } from "../src/chess-api.js";

// ─── ovhHostErrorHint ──────────────────────────────────────────────
// explorer.lichess.ovh / tablebase.lichess.ovh reject some client IPs
// (datacenter/VPN ranges) with 401/403 even though they take no auth. Without
// a hint such an error reads as a token problem — which it never is, since no
// Authorization header is sent to these hosts.

test("ovhHostErrorHint explains 401 as an IP block, not an auth problem", () => {
  const hint = ovhHostErrorHint(401);
  assert.match(hint, /no auth/i);
  assert.match(hint, /IP/);
});

test("ovhHostErrorHint also covers 403", () => {
  assert.notEqual(ovhHostErrorHint(403), "");
});

test("ovhHostErrorHint stays silent for other statuses", () => {
  assert.equal(ovhHostErrorHint(404), "");
  assert.equal(ovhHostErrorHint(429), "");
});

// ─── rateLimitHint ─────────────────────────────────────────────────
// Lichess answers bursts with 429 and expects a full minute of quiet. Without
// the hint a model is likely to retry immediately and make things worse (#83).

test("rateLimitHint tells the model to wait a minute on 429", () => {
  const hint = rateLimitHint(429);
  assert.match(hint, /rate limited/i);
  assert.match(hint, /minute/i);
});

test("rateLimitHint stays silent for other statuses", () => {
  assert.equal(rateLimitHint(200), "");
  assert.equal(rateLimitHint(404), "");
  assert.equal(rateLimitHint(503), "");
});

// ─── streamersErrorHint ────────────────────────────────────────────
// /pub/streamers is still in the official docs but has been observed to 404
// upstream; flag that so the error isn't mistaken for a wrong path here.

test("streamersErrorHint flags the documented-but-404 upstream state", () => {
  const hint = streamersErrorHint(404);
  assert.match(hint, /documented/i);
  assert.match(hint, /upstream/i);
});

test("streamersErrorHint stays silent for other statuses", () => {
  assert.equal(streamersErrorHint(500), "");
  assert.equal(streamersErrorHint(429), "");
});
