import { readFileSync } from "node:fs";
import { join } from "node:path";

// Single source of truth for the version. Read package.json at runtime (it ships
// in the npm tarball and sits one level above dist/) rather than hardcoding the
// number in several places. Works the same when compiled (dist/version.js),
// under tsx (src/version.ts), and when installed as a package.
const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf8"),
) as { version: string };

export const VERSION = pkg.version;
