import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { VERSION } from "../src/version.js";

test("VERSION is sourced from package.json (single source of truth)", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
    version: string;
  };
  assert.equal(VERSION, pkg.version);
  assert.match(VERSION, /^\d+\.\d+\.\d+/);
});
