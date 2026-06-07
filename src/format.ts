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
