import { test } from "node:test";
import assert from "node:assert/strict";
import { nextPuzzlePath } from "../src/lichess-api.js";

// ─── nextPuzzlePath (#61 — optional theme/difficulty/color filters) ──

test("nextPuzzlePath returns the bare path when no filters are given", () => {
  assert.equal(nextPuzzlePath({}), "/api/puzzle/next");
});

test("nextPuzzlePath adds only the angle when a theme is given", () => {
  assert.equal(nextPuzzlePath({ angle: "fork" }), "/api/puzzle/next?angle=fork");
});

test("nextPuzzlePath includes every provided filter", () => {
  const path = nextPuzzlePath({
    angle: "endgame",
    difficulty: "harder",
    color: "white",
  });
  assert.match(path, /^\/api\/puzzle\/next\?/);
  assert.match(path, /angle=endgame/);
  assert.match(path, /difficulty=harder/);
  assert.match(path, /color=white/);
});

test("nextPuzzlePath omits empty/undefined filters rather than sending blanks", () => {
  const path = nextPuzzlePath({ angle: "", difficulty: undefined, color: "black" });
  assert.doesNotMatch(path, /angle=/);
  assert.doesNotMatch(path, /difficulty=/);
  assert.match(path, /color=black/);
});

test("nextPuzzlePath URL-encodes an opening angle with special characters", () => {
  const path = nextPuzzlePath({ angle: "Sicilian Defense" });
  assert.match(path, /angle=Sicilian(\+|%20)Defense/);
});
