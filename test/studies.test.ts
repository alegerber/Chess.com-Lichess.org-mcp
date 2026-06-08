import { test } from "node:test";
import assert from "node:assert/strict";
import type { StudyMetadata } from "../src/lichess-api.js";
import * as lichessTools from "../src/tools/lichess.js";

// ─── formatStudies (#40 — GET /api/study/by/{user}) ────────────────

test("formatStudies lists studies with name and id", () => {
  const studies: StudyMetadata[] = [
    { id: "1UmQwWtW", name: "position bookmarks", updatedAt: 1777527731090 },
    { id: "fRVcvGwH", name: "thibault's Study" },
  ];
  const out = lichessTools.formatStudies(studies);
  assert.match(out, /Found 2 studies/);
  assert.match(out, /position bookmarks \(1UmQwWtW\)/);
  assert.match(out, /thibault's Study \(fRVcvGwH\)/);
});

test("formatStudies reports when a user has no public studies", () => {
  assert.match(lichessTools.formatStudies([]), /No public studies found/);
});
