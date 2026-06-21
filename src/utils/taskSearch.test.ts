import { describe, it, expect } from 'vitest';
import { parseSearchQuery, matchesSearch } from './taskSearch';

describe('parseSearchQuery', () => {
  it('extracts a file: token, lowercased and case-insensitive', () => {
    expect(parseSearchQuery('file:Inbox/Piano.md').filePath).toBe('inbox/piano.md');
    expect(parseSearchQuery('FILE:Notes').filePath).toBe('notes');
  });

  it('finds a file: token among other words', () => {
    expect(parseSearchQuery('todo file:Work/Q3').filePath).toBe('work/q3');
  });

  it('returns null when there is no file: token', () => {
    expect(parseSearchQuery('').filePath).toBeNull();
    expect(parseSearchQuery('piano').filePath).toBeNull();
  });
});

describe('matchesSearch', () => {
  const task = (filePath: string) => ({ filePath });

  it('matches when the path contains the file: value (case-insensitive)', () => {
    expect(matchesSearch(task('/Vault/Inbox/Piano.md'), parseSearchQuery('file:inbox/piano'))).toBe(true);
    expect(matchesSearch(task('/Vault/Inbox/Piano.md'), parseSearchQuery('file:PIANO'))).toBe(true);
  });

  it('excludes when the path does not contain the value', () => {
    expect(matchesSearch(task('/Vault/Inbox/Piano.md'), parseSearchQuery('file:Work'))).toBe(false);
  });

  it('matches everything when there is no file: token', () => {
    expect(matchesSearch(task('/Vault/Anything.md'), parseSearchQuery('hello'))).toBe(true);
    expect(matchesSearch(task('/Vault/Anything.md'), parseSearchQuery(''))).toBe(true);
  });
});
