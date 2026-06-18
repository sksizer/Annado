import { describe, it, expect } from 'vitest';
import { normalizeTagInput, sameTag, tagsInclude, resolveTagToAdd, tagMatchesFilter, tagsMatchFilter, splitTagPath } from './tags';
import type { TagInfo } from '../types/task';

const tag = (name: string, count = 1): TagInfo => ({ name, count });

describe('normalizeTagInput', () => {
  it('trims and strips a single leading #, preserving case', () => {
    expect(normalizeTagInput('  #Research ')).toBe('Research');
    expect(normalizeTagInput('research')).toBe('research');
  });
});

describe('sameTag / tagsInclude', () => {
  it('matches case-insensitively', () => {
    expect(sameTag('Research', 'research')).toBe(true);
    expect(sameTag('work', 'home')).toBe(false);
    expect(tagsInclude(['Research', 'Home'], 'research')).toBe(true);
    expect(tagsInclude(['Research'], 'work')).toBe(false);
  });
});

describe('resolveTagToAdd', () => {
  const available = [tag('research'), tag('reading'), tag('home')];

  it('uses the arrow-highlighted suggestion first', () => {
    const suggestions = [tag('research'), tag('reading')];
    expect(resolveTagToAdd('rea', suggestions, 1, available)).toBe('reading');
  });

  it('returns null for empty input with no highlight', () => {
    expect(resolveTagToAdd('   ', [], -1, available)).toBeNull();
  });

  it('selects the existing tag on an exact case-insensitive match', () => {
    const suggestions = [tag('research'), tag('reading')];
    expect(resolveTagToAdd('Research', suggestions, -1, available)).toBe('research');
  });

  it('selects the sole remaining suggestion', () => {
    expect(resolveTagToAdd('rese', [tag('research')], -1, available)).toBe('research');
  });

  it('creates the typed tag when there is no match', () => {
    expect(resolveTagToAdd('newtag', [], -1, available)).toBe('newtag');
  });

  it('does not hijack a new short tag that is a substring of several existing tags', () => {
    // "re" matches both research and reading, so it stays a new free-text tag
    const suggestions = [tag('research'), tag('reading')];
    expect(resolveTagToAdd('re', suggestions, -1, available)).toBe('re');
  });
});

describe('tagMatchesFilter / tagsMatchFilter (nested tags)', () => {
  it('matches the tag itself and its descendants, case-insensitively', () => {
    expect(tagMatchesFilter('inbox', 'inbox')).toBe(true);
    expect(tagMatchesFilter('inbox/to-read', 'inbox')).toBe(true);
    expect(tagMatchesFilter('Inbox/To-Read', 'inbox')).toBe(true);
    expect(tagMatchesFilter('inbox/to-read/urgent', 'inbox/to-read')).toBe(true);
  });

  it('does not match siblings, prefixes-without-slash, or unrelated tags', () => {
    expect(tagMatchesFilter('inboxed', 'inbox')).toBe(false);
    expect(tagMatchesFilter('inbox-x', 'inbox')).toBe(false);
    expect(tagMatchesFilter('work', 'inbox')).toBe(false);
    expect(tagMatchesFilter('inbox', 'inbox/to-read')).toBe(false);
  });

  it('tagsMatchFilter is true when any tag is in the subtree', () => {
    expect(tagsMatchFilter(['work', 'inbox/to-read'], 'inbox')).toBe(true);
    expect(tagsMatchFilter(['work', 'home'], 'inbox')).toBe(false);
  });
});

describe('splitTagPath (breadcrumb header)', () => {
  it('returns no crumbs for a single-segment tag', () => {
    expect(splitTagPath('email')).toEqual({ crumbs: [], leaf: 'email' });
  });

  it('splits a two-segment tag into one bare crumb and a bare leaf', () => {
    expect(splitTagPath('buy/testing-hyphens')).toEqual({
      crumbs: [{ label: 'buy', path: 'buy' }],
      leaf: 'testing-hyphens',
    });
  });

  it('uses bare segment labels and accumulates the path for deeper nesting', () => {
    expect(splitTagPath('a/b/c')).toEqual({
      crumbs: [
        { label: 'a', path: 'a' },
        { label: 'b', path: 'a/b' },
      ],
      leaf: 'c',
    });
  });
});
