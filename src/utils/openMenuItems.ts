import type { ContextMenuItem } from '../components/ContextMenu';
import {
  openEntityFile,
  openWith,
  openTargetFor,
  openersForPath,
  openLabel,
  type PathOpenerInfo,
} from './pathOpener';

/**
 * Context-menu items for opening an entity's backing file:
 *   - "Open" / "Open in Obsidian" — the default action (Obsidian if available, else OS default)
 *   - "Open with ▸" — a flyout of every detected app that can open this path
 *
 * Spread the result into any entity's context menu. The "Open with" submenu is
 * omitted when no app can open the path.
 */
export interface OpenMenuOptions {
  /** App used for the top-level default "Open" action (null = Obsidian-or-OS-default). */
  defaultAppId?: string | null;
  /** App ids to omit from the "Open with…" submenu. */
  hiddenAppIds?: string[];
}

export function buildOpenMenuItems(
  path: string,
  openers: PathOpenerInfo[],
  options: OpenMenuOptions = {},
): ContextMenuItem[] {
  const { defaultAppId = null, hiddenAppIds = [] } = options;
  const items: ContextMenuItem[] = [
    {
      label: openLabel(openers, path, defaultAppId),
      onClick: () => void openEntityFile(path, openers, defaultAppId).catch(console.error),
    },
  ];

  const usable = openersForPath(openers, path).filter((o) => !hiddenAppIds.includes(o.appId));
  if (usable.length > 0) {
    items.push({
      label: 'Open with',
      submenu: usable.map((o) => ({
        label: o.name,
        onClick: () => void openWith(openTargetFor(path, o.appId), o.appId).catch(console.error),
      })),
    });
  }

  return items;
}
