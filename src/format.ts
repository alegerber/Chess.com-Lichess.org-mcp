export function jsonBlock(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/** Convert a Unix timestamp to ISO string. Chess.com uses seconds; Lichess uses milliseconds. */
export function toISOString(ts: number, unit: "s" | "ms" = "ms"): string {
  return new Date(unit === "s" ? ts * 1000 : ts).toISOString();
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

/** Wrap a string result in the MCP tool content envelope. */
export function text(t: string) {
  return { content: [{ type: "text" as const, text: t }] };
}
