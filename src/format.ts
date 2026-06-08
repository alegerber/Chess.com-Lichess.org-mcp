const JSON_BLOCK_MAX_CHARS = 50_000;

export function jsonBlock(data: unknown): string {
  const serialized = JSON.stringify(data, null, 2);
  if (serialized.length <= JSON_BLOCK_MAX_CHARS) return serialized;
  // Last-resort backstop so a single tool call can never blow the context window.
  return (
    serialized.slice(0, JSON_BLOCK_MAX_CHARS) +
    `\n… truncated (${serialized.length - JSON_BLOCK_MAX_CHARS} more characters not shown)`
  );
}

/**
 * Cap raw text (e.g. PGN) at a character budget with a truncation marker, so a
 * large export can never blow the context window. Mirrors jsonBlock's backstop
 * for non-JSON payloads.
 */
export function capText(s: string, max = JSON_BLOCK_MAX_CHARS): string {
  if (s.length <= max) return s;
  return (
    s.slice(0, max) +
    `\n… truncated (${s.length - max} more characters not shown)`
  );
}

/**
 * Render a game/export payload as raw PGN text (size-capped) when asPgn is set,
 * otherwise as a JSON block. Shared by the game/export tools that accept a
 * `format: json | pgn` option (#46).
 */
export function pgnOrJson(data: unknown, asPgn: boolean): string {
  return asPgn
    ? capText(typeof data === "string" ? data : String(data))
    : jsonBlock(data);
}

/**
 * Convert a Unix timestamp to ISO string. Chess.com uses seconds; Lichess uses milliseconds.
 * Returns "unknown" for missing/non-finite input instead of throwing — some upstream
 * responses (e.g. closed/disabled accounts) omit timestamp fields the types mark as required.
 */
export function toISOString(ts: number, unit: "s" | "ms" = "ms"): string {
  if (ts == null || !Number.isFinite(ts)) return "unknown";
  const date = new Date(unit === "s" ? ts * 1000 : ts);
  return Number.isNaN(date.getTime()) ? "unknown" : date.toISOString();
}

/** Serialize an array to JSON, appending a note if items were truncated. */
export function truncated(
  items: unknown[],
  max: number,
  label = "items",
): string {
  if (items.length <= max) return jsonBlock(items);
  return (
    jsonBlock(items.slice(0, max)) +
    `\n… ${items.length - max} more ${label} not shown`
  );
}

/** A single page taken from a fully-materialized list (client-side paging). */
export interface Page<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  /** Offset to request the next page, or null when this is the last page. */
  nextOffset: number | null;
}

/**
 * Slice a window out of a fully-materialized list. Several Chess.com endpoints
 * return the entire list with no server-side paging, so callers page through it
 * client-side via offset/limit (#45). Out-of-range and negative offsets are
 * clamped instead of throwing.
 */
export function paginate<T>(items: T[], offset = 0, limit = 50): Page<T> {
  const total = items.length;
  const safeOffset = Math.max(0, Math.min(offset, total));
  const page = items.slice(safeOffset, safeOffset + Math.max(0, limit));
  const end = safeOffset + page.length;
  return {
    items: page,
    total,
    offset: safeOffset,
    limit,
    nextOffset: end < total ? end : null,
  };
}

/**
 * Render a paginated string list with a total count, the shown range, and a
 * hint for fetching the next page. Shared by the paginated Chess.com list tools
 * (#45) so they present truncation consistently instead of ad-hoc "N more not
 * shown" suffixes.
 */
export function formatList(
  items: string[],
  opts: {
    offset?: number;
    limit?: number;
    label: string;
    join?: string;
    subject?: string;
  },
): string {
  const { offset = 0, limit = 50, label, join = ", ", subject } = opts;
  const p = paginate(items, offset, limit);
  const header = `Found ${p.total} ${label}${subject ? ` ${subject}` : ""}.`;
  if (p.total === 0) return header;
  const start = p.offset + 1;
  const end = p.offset + p.items.length;
  const more =
    p.nextOffset !== null
      ? ` (pass offset=${p.nextOffset} for the next page)`
      : "";
  return `${header}\nShowing ${start}–${end} of ${p.total}${more}\n\n${p.items.join(join)}`;
}

/**
 * Wrap a string result in the MCP tool content envelope.
 * Pass isError=true for tool-execution failures so the host/LLM can tell failure
 * from success (per the MCP spec, errors must be reported in-result, not as plain text).
 */
export function text(t: string, isError = false) {
  return { content: [{ type: "text" as const, text: t }], isError };
}

/**
 * Map any value thrown by a tool handler to a readable, isError-tagged result.
 * Distinguishes typed API errors (carry a numeric `status`), invalid response
 * bodies (SyntaxError from JSON parsing), and network failures (Error with a
 * `cause`, e.g. Node's `TypeError: fetch failed`) so the model gets actionable
 * context instead of an opaque backstop message.
 */
export function errorResult(service: string, e: unknown) {
  if (
    e instanceof Error &&
    typeof (e as { status?: unknown }).status === "number"
  ) {
    return text(
      `${service} error (${(e as Error & { status: number }).status}): ${e.message}`,
      true,
    );
  }
  if (e instanceof SyntaxError) {
    return text(`${service} returned an invalid response: ${e.message}`, true);
  }
  if (
    e instanceof Error &&
    (e.name === "TimeoutError" || e.name === "AbortError")
  ) {
    return text(`${service} request timed out`, true);
  }
  if (e instanceof Error && (e as { cause?: unknown }).cause != null) {
    return text(
      `${service} request failed: ${e.message} (${String((e as { cause: unknown }).cause)})`,
      true,
    );
  }
  return text(
    `${service} request failed: ${e instanceof Error ? e.message : String(e)}`,
    true,
  );
}
