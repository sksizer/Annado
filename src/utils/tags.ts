import type { TagInfo } from '../types/task';

// Shared tag identity + resolution helpers. Tags are case-insensitive for
// identity (like Obsidian) but the original casing is preserved in storage.

/** Trim and strip a single leading "#". Case is left untouched. */
export function normalizeTagInput(s: string): string {
  return s.trim().replace(/^#/, '');
}

/** Two tag names are the same tag if they match case-insensitively. */
export function sameTag(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** A single ancestor segment of a nested tag, for breadcrumb rendering. */
export interface TagCrumb {
  /** Display label: the bare segment (no leading "#"). */
  label: string;
  /** Full cumulative tag path for this crumb (e.g. "inbox" or "inbox/to-read"). */
  path: string;
}

export interface TagPathParts {
  /** Parent crumbs, outermost first. Empty for a single-segment tag. */
  crumbs: TagCrumb[];
  /** The last segment — the page title (e.g. "to-read" for "inbox/to-read"). */
  leaf: string;
}

/**
 * Split a bare nested tag path (Obsidian-style `parent/child`, no leading "#")
 * into clickable parent crumbs + the leaf segment. A single-segment tag returns
 * no crumbs and its own name as the leaf. Crumb labels are bare segments; the
 * caller adds the "#" only where it wants it (e.g. on the leaf title).
 */
export function splitTagPath(tag: string): TagPathParts {
  const segments = tag.split('/').filter(Boolean);
  const leaf = segments[segments.length - 1] ?? tag;
  const crumbs: TagCrumb[] = [];
  for (let i = 0; i < segments.length - 1; i++) {
    crumbs.push({
      label: segments[i],
      path: segments.slice(0, i + 1).join('/'),
    });
  }
  return { crumbs, leaf };
}

/** Whether `tags` already contains `tag` (case-insensitively). Exact match only —
 * used for add/dedup, so adding `#inbox` does not collide with `#inbox/to-read`. */
export function tagsInclude(tags: string[], tag: string): boolean {
  return tags.some((t) => sameTag(t, tag));
}

/** A task tag matches a (possibly parent) filter tag if it IS that tag or a nested
 * descendant of it (`filter/…`). Case-insensitive. So `#inbox` matches `#inbox` and
 * `#inbox/to-read`, but not `#inboxed` or `#inbox-x`. */
export function tagMatchesFilter(taskTag: string, filterTag: string): boolean {
  const t = taskTag.toLowerCase();
  const f = filterTag.toLowerCase();
  return t === f || t.startsWith(f + '/');
}

/** Whether any of `tags` matches `filterTag` as itself or an ancestor (subtree match). */
export function tagsMatchFilter(tags: string[], filterTag: string): boolean {
  return tags.some((t) => tagMatchesFilter(t, filterTag));
}

/**
 * Resolve the tag name to add when the user commits the input (Enter/Tab/comma).
 * Precedence: arrow-highlighted suggestion → exact case-insensitive match against
 * existing tags → a single remaining suggestion → otherwise the typed text as a
 * new tag. Returns null when there's nothing to add.
 */
export function resolveTagToAdd(
  input: string,
  suggestions: TagInfo[],
  highlightedIndex: number,
  availableTags: TagInfo[],
): string | null {
  if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
    return suggestions[highlightedIndex].name;
  }
  const trimmed = normalizeTagInput(input);
  if (!trimmed) return null;
  const exact = availableTags.find((t) => sameTag(t.name, trimmed));
  if (exact) return exact.name;
  if (suggestions.length === 1) return suggestions[0].name;
  return trimmed;
}
