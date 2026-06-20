import { describe, it, expect, vi } from 'vitest';

// pathOpener.ts imports the Tauri bridge at module load.
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import {
  effectiveOpeners,
  effectiveDefault,
  settingsTargets,
  OBSIDIAN_APP_ID,
  EMPTY_OPENER_PREFS,
  type PathOpenerInfo,
  type OpenerPrefs,
} from './pathOpener';

const obsidian: PathOpenerInfo = {
  appId: OBSIDIAN_APP_ID, name: 'Obsidian', acceptsDirectories: true,
  fileSupport: { kind: 'extensions', extensions: ['md'] },
};
const vscode: PathOpenerInfo = {
  appId: 'vscode', name: 'VS Code', acceptsDirectories: true, fileSupport: { kind: 'any' },
};
const finder: PathOpenerInfo = {
  appId: 'finder', name: 'Finder', acceptsDirectories: true, fileSupport: { kind: 'not_supported' },
};
const detected = [obsidian, vscode, finder];
const MD = '/vault/Note.md';

const prefs = (p: Partial<OpenerPrefs> = {}): OpenerPrefs => ({ ...EMPTY_OPENER_PREFS, ...p });
const ids = (list: { id: string }[]) => list.map((e) => e.id);

describe('effectiveOpeners (AC-2/3/4/6/7)', () => {
  it('returns only path-usable, non-hidden openers; Obsidian present when the vault is an Obsidian vault', () => {
    // finder is not_supported for a file with an extension → excluded.
    expect(ids(effectiveOpeners(detected, prefs(), true, MD))).toEqual(['obsidian', 'vscode']);
  });

  it('drops Obsidian when not an Obsidian vault (AC-6)', () => {
    expect(ids(effectiveOpeners(detected, prefs(), false, MD))).toEqual(['vscode']);
  });

  it('hides ids listed in prefs.hidden (AC-3)', () => {
    expect(ids(effectiveOpeners(detected, prefs({ hidden: ['vscode'] }), true, MD))).toEqual(['obsidian']);
  });

  it('respects prefs.order (AC-4)', () => {
    expect(ids(effectiveOpeners(detected, prefs({ order: ['vscode', 'obsidian'] }), true, MD)))
      .toEqual(['vscode', 'obsidian']);
  });

  it('includes custom openers and honors order across custom + detected (AC-5)', () => {
    const p = prefs({
      custom: [{ id: 'custom-1', name: 'My Script', command: 'sh {file}' }],
      order: ['obsidian', 'custom-1', 'vscode'],
    });
    expect(ids(effectiveOpeners(detected, p, true, MD))).toEqual(['obsidian', 'custom-1', 'vscode']);
  });
});

describe('effectiveDefault (AC-4/7)', () => {
  it('is the first effective opener', () => {
    expect(effectiveDefault(detected, prefs({ order: ['vscode'] }), true, MD)?.id).toBe('vscode');
  });

  it('is null when no usable+visible opener exists (caller falls back to OS default)', () => {
    // Only finder, which cannot open a file with an extension.
    expect(effectiveDefault([finder], prefs(), true, MD)).toBeNull();
  });
});

describe('settingsTargets (AC-1/2/6)', () => {
  it('lists every configured target (not path-filtered), Obsidian gated by the toggle, carrying hidden flags', () => {
    const p = prefs({
      hidden: ['finder'],
      custom: [{ id: 'custom-1', name: 'My Script', command: 'sh {file}' }],
    });
    const onObsidian = settingsTargets(detected, p, true);
    expect(onObsidian.map((t) => t.id).sort()).toEqual(['custom-1', 'finder', 'obsidian', 'vscode']);
    expect(onObsidian.find((t) => t.id === 'finder')?.hidden).toBe(true);
    expect(onObsidian.find((t) => t.id === 'custom-1')?.custom).toBe(true);

    // Obsidian disappears from the settings list when the vault is not Obsidian.
    expect(settingsTargets(detected, p, false).some((t) => t.id === OBSIDIAN_APP_ID)).toBe(false);
  });
});
