import { test } from "node:test";
import assert from "node:assert/strict";
import * as lichess from "../src/lichess-api.js";

// ─── L9 + M5: pure NDJSON line parser (CRLF-safe, skips bad lines, caps) ──

test("parseNdjson parses multiple JSON lines", () => {
  const out = lichess.parseNdjson('{"a":1}\n{"a":2}\n');
  assert.deepEqual(out, [{ a: 1 }, { a: 2 }]);
});

test("parseNdjson skips blank lines and strips CRLF carriage returns", () => {
  const out = lichess.parseNdjson('{"a":1}\r\n\r\n{"a":2}\r\n');
  assert.deepEqual(out, [{ a: 1 }, { a: 2 }]);
});

test("parseNdjson skips a malformed line and keeps the rest", () => {
  const out = lichess.parseNdjson('{"a":1}\nnot json\n{"a":2}\n');
  assert.deepEqual(out, [{ a: 1 }, { a: 2 }]);
});

test("parseNdjson respects maxLines", () => {
  const out = lichess.parseNdjson('{"a":1}\n{"a":2}\n{"a":3}\n', 2);
  assert.deepEqual(out, [{ a: 1 }, { a: 2 }]);
});
