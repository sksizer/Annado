import { describe, it, expect } from 'vitest';
import { toVaultRelativePath } from './FilePathLabel';

describe('toVaultRelativePath', () => {
  it('strips the vault prefix (and the leading slash) for files inside the vault', () => {
    expect(toVaultRelativePath('/Users/me/Vault/Inbox/Piano.md', '/Users/me/Vault')).toBe('Inbox/Piano.md');
  });

  it('handles a vault path that already ends with a slash', () => {
    expect(toVaultRelativePath('/Users/me/Vault/Inbox/Piano.md', '/Users/me/Vault/')).toBe('Inbox/Piano.md');
  });

  it('returns the path as-is when it is not under the vault', () => {
    expect(toVaultRelativePath('/elsewhere/Note.md', '/Users/me/Vault')).toBe('/elsewhere/Note.md');
  });

  it('returns the path as-is when there is no vault path', () => {
    expect(toVaultRelativePath('Inbox/Piano.md', null)).toBe('Inbox/Piano.md');
  });
});
