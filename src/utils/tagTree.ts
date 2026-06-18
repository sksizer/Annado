import type { TagInfo, Task } from '../types/task';

// A node in the nested-tag hierarchy (Obsidian-style `parent/child`).
export interface TagNode {
  name: string;        // full path, e.g. "inbox/to-read"
  label: string;       // last segment, e.g. "to-read"
  count: number;       // incomplete tasks matching this node's subtree
  children: TagNode[];
}

/**
 * Build the nested-tag tree from the flat tag list, synthesizing intermediate
 * parents that aren't tags in their own right (e.g. `inbox` when only
 * `inbox/to-read` exists). Subtree counts come from `tasks`: each task counts once
 * per ancestor it touches, so a task tagged both `inbox/a` and `inbox/b` counts
 * once for `inbox` (no double-counting). Canonical casing is taken from `tags`
 * where available, otherwise from the first occurrence in a tag path.
 */
export function buildTagTree(tags: TagInfo[], tasks: Task[]): TagNode[] {
  // Canonical display casing per lowercase path segment-prefix.
  const casing = new Map<string, string>();
  const remember = (fullName: string) => {
    const parts = fullName.split('/');
    for (let i = 0; i < parts.length; i++) {
      const prefixLower = parts.slice(0, i + 1).join('/').toLowerCase();
      if (!casing.has(prefixLower)) casing.set(prefixLower, parts.slice(0, i + 1).join('/'));
    }
  };
  for (const t of tags) remember(t.name);

  // Subtree counts: for each incomplete task, collect the set of node-prefixes its
  // tags touch, then increment each once.
  const counts = new Map<string, number>();
  for (const task of tasks) {
    if (task.completed) continue;
    const prefixes = new Set<string>();
    for (const tag of task.tags) {
      const parts = tag.toLowerCase().split('/');
      for (let i = 0; i < parts.length; i++) prefixes.add(parts.slice(0, i + 1).join('/'));
    }
    for (const p of prefixes) counts.set(p, (counts.get(p) ?? 0) + 1);
  }

  // Assemble the tree from the known tag paths (+ synthesized parents).
  const roots: TagNode[] = [];
  const byKey = new Map<string, TagNode>();
  const ensure = (lowerPath: string): TagNode => {
    const existing = byKey.get(lowerPath);
    if (existing) return existing;
    const slash = lowerPath.lastIndexOf('/');
    const name = casing.get(lowerPath) ?? lowerPath;
    const node: TagNode = {
      name,
      label: name.slice(name.lastIndexOf('/') + 1),
      count: counts.get(lowerPath) ?? 0,
      children: [],
    };
    byKey.set(lowerPath, node);
    if (slash < 0) {
      roots.push(node);
    } else {
      ensure(lowerPath.slice(0, slash)).children.push(node);
    }
    return node;
  };
  for (const t of tags) ensure(t.name.toLowerCase());

  const sortRec = (nodes: TagNode[]) => {
    nodes.sort((a, b) => a.label.toLowerCase().localeCompare(b.label.toLowerCase()));
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}
