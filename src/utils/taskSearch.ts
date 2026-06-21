export interface ParsedSearch {
  /** Lowercased value from a `file:` token, or null when absent. */
  filePath: string | null;
}

/**
 * Parse a simple Inbox search query. For now it understands a single token:
 *
 *   file:<path>   — keep only tasks whose source file path contains <path>
 *
 * The value runs to the next whitespace, so paths with spaces aren't supported
 * yet — type a non-space fragment (e.g. `file:Piano`). Anything outside a
 * `file:` token is ignored for now (a no-op filter), leaving room to grow the
 * grammar later.
 */
export function parseSearchQuery(query: string): ParsedSearch {
  const match = query.match(/(?:^|\s)file:(\S+)/i);
  return { filePath: match ? match[1].toLowerCase() : null };
}

/** Whether a task satisfies the parsed search (currently: file-path substring). */
export function matchesSearch(task: { filePath: string }, parsed: ParsedSearch): boolean {
  if (parsed.filePath && !task.filePath.toLowerCase().includes(parsed.filePath)) {
    return false;
  }
  return true;
}
