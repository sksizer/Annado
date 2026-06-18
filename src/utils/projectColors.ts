import type { TagInfo } from '../types/task';
import { sameTag } from './tags';

// Shared color palette for projects, tags, and the app accent setting
export const PROJECT_COLORS = [
  '#5C6BC0', // Indigo (default)
  '#E53935', // Red
  '#F5C000', // Yellow
  '#43A047', // Green
  '#1E88E5', // Blue
  '#8E6AC8', // Purple
  '#00ACC1', // Cyan
  '#FF7043', // Deep Orange
  '#78909C', // Blue Grey
  '#EC407A', // Pink
  '#8D6E63', // Brown
  '#26A69A', // Teal
  '#AB47BC', // Violet
  '#FFA726', // Orange
  '#66BB6A', // Light Green
  '#42A5F5', // Light Blue
  '#EF5350', // Coral
  '#7E57C2', // Deep Purple
  '#26C6DA', // Light Cyan
  '#BDBDBD', // Grey
];

export const DEFAULT_ACCENT = '#5C6BC0';

/**
 * Lighten (positive percent) or darken (negative percent) a #rrggbb color
 * by mixing it toward white or black.
 */
export function shadeHex(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  const target = percent < 0 ? 0 : 255;
  const p = Math.min(Math.abs(percent), 100) / 100;
  const mix = (c: number) => Math.round(c + (target - c) * p);
  return `#${((mix(r) << 16) | (mix(g) << 8) | mix(b)).toString(16).padStart(6, '0')}`;
}

export const PRIORITY_CONFIG: Record<number, { color: string; label: string }> = {
  1: { color: '#E53935', label: '!!!' },
  2: { color: '#FB8C00', label: '!!' },
  3: { color: '#5C6BC0', label: '!' },
};

/**
 * Get the color for a project, with inheritance from parent folder
 */
export function getProjectColor(
  projectName: string,
  parentFolder: string | null | undefined,
  projectColors: Record<string, string>
): string {
  // First check if this project has its own color
  if (projectColors[projectName]) {
    return projectColors[projectName];
  }
  // If it has a parent, inherit parent's color
  if (parentFolder && projectColors[parentFolder]) {
    return projectColors[parentFolder];
  }
  // Default color
  return '#5C6BC0';
}

/**
 * Get the color for a tag
 */
/**
 * Resolve a tag's own color, or the nearest ancestor's (inbox/to-read -> inbox),
 * case-insensitively — mirrors getProjectColor's parent inheritance. Returns
 * undefined when neither the tag nor any ancestor has a color set, so callers can
 * distinguish "no color" (e.g. render neutral) from the default accent.
 */
export function resolveTagColor(
  tagName: string,
  tagColors: Record<string, string>
): string | undefined {
  // Tag colors are keyed by lowercase name (case-insensitive identity).
  let key = tagName.toLowerCase();
  for (;;) {
    if (tagColors[key]) return tagColors[key];
    const slash = key.lastIndexOf('/');
    if (slash < 0) break;
    key = key.slice(0, slash);
  }
  // Fall back to the exact key so colors set before lowercase-keying still resolve.
  return tagColors[tagName];
}

export function getTagColor(
  tagName: string,
  tagColors: Record<string, string>
): string {
  return resolveTagColor(tagName, tagColors) ?? '#5C6BC0';
}

export function filterTagSuggestions(
  input: string,
  all: TagInfo[],
  selected: string[],
): TagInfo[] {
  if (!input.trim()) return [];
  const q = input.toLowerCase().replace(/^#/, '');
  return all.filter(t => t.name.toLowerCase().includes(q) && !selected.some(s => sameTag(s, t.name))).slice(0, 6);
}
