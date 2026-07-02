import { test } from "node:test";
import assert from "node:assert/strict";
import { lichessSerialized } from "../src/lichess-api.js";

// ─── lichessSerialized (#83) ───────────────────────────────────────
// Lichess documents "one request at a time" for lichess.org; parallel tool
// calls are funneled through a promise chain so they can't overlap.

test("lichessSerialized runs tasks strictly one after another", async () => {
  const events: string[] = [];
  const slow = lichessSerialized(async () => {
    events.push("start slow");
    await new Promise((resolve) => setTimeout(resolve, 20));
    events.push("end slow");
  });
  const fast = lichessSerialized(async () => {
    events.push("start fast");
  });
  await Promise.all([slow, fast]);
  assert.deepEqual(events, ["start slow", "end slow", "start fast"]);
});

test("lichessSerialized returns each task's own result", async () => {
  const [a, b] = await Promise.all([
    lichessSerialized(async () => "a"),
    lichessSerialized(async () => "b"),
  ]);
  assert.equal(a, "a");
  assert.equal(b, "b");
});

test("lichessSerialized keeps the chain alive after a failure", async () => {
  await assert.rejects(
    lichessSerialized(async () => {
      throw new Error("boom");
    }),
    /boom/,
  );
  // A rejected task must not poison the queue for the next request.
  assert.equal(
    await lichessSerialized(async () => "still works"),
    "still works",
  );
});
