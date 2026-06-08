import { test } from "node:test";
import assert from "node:assert/strict";
import * as format from "../src/format.js";

// ─── paginate() — client-side paging over a fully-materialized list (#45) ──

test("paginate returns a window and reports the total", () => {
  const p = format.paginate([1, 2, 3, 4, 5], 0, 2);
  assert.deepEqual(p.items, [1, 2]);
  assert.equal(p.total, 5);
  assert.equal(p.offset, 0);
  assert.equal(p.limit, 2);
  assert.equal(p.nextOffset, 2);
});

test("paginate advances with offset and signals the last page with nextOffset null", () => {
  const p = format.paginate([1, 2, 3, 4, 5], 4, 2);
  assert.deepEqual(p.items, [5]);
  assert.equal(p.nextOffset, null, "no more items after the last one");
});

test("paginate clamps an out-of-range offset to the end instead of throwing", () => {
  const p = format.paginate([1, 2, 3], 99, 10);
  assert.deepEqual(p.items, []);
  assert.equal(p.offset, 3);
  assert.equal(p.nextOffset, null);
});

test("paginate clamps a negative offset to zero", () => {
  const p = format.paginate([1, 2, 3], -5, 2);
  assert.equal(p.offset, 0);
  assert.deepEqual(p.items, [1, 2]);
});

// ─── formatList() — shared header/range/more-hint renderer (#45) ──

test("formatList renders total, range and a next-page hint", () => {
  const out = format.formatList(["a", "b", "c"], {
    offset: 0,
    limit: 2,
    label: "players",
    subject: "with title GM",
  });
  assert.match(out, /Found 3 players with title GM\./);
  assert.match(out, /Showing 1–2 of 3/);
  assert.match(out, /offset=2/);
  assert.match(out, /a, b/);
});

test("formatList omits the next-page hint on the final page", () => {
  const out = format.formatList(["a", "b"], { offset: 0, limit: 5, label: "clubs" });
  assert.match(out, /Showing 1–2 of 2/);
  assert.doesNotMatch(out, /offset=/);
});

test("formatList returns just the header when the list is empty", () => {
  const out = format.formatList([], { label: "players", subject: "from XX" });
  assert.equal(out, "Found 0 players from XX.");
});

test("formatList shows only the header for an out-of-range offset on a non-empty list", () => {
  // offset past the end yields an empty page — must not render a backwards range.
  const out = format.formatList(["a", "b", "c", "d", "e"], {
    offset: 99,
    limit: 2,
    label: "players",
  });
  assert.equal(out, "Found 5 players.");
  assert.doesNotMatch(out, /Showing/);
});
