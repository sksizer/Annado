import { useShallow } from 'zustand/react/shallow';
import { useTaskStore } from '../stores/taskStore';

/**
 * The file path as shown to the user: relative to the vault root when it sits
 * inside the vault, otherwise the path as-is. Exported for testing.
 */
export function toVaultRelativePath(filePath: string, vaultPath: string | null): string {
  if (vaultPath && filePath.startsWith(vaultPath)) {
    return filePath.slice(vaultPath.length).replace(/^[/\\]+/, '');
  }
  return filePath;
}

/**
 * Faint, right-aligned source-file path affordance. Renders only when the
 * "Show file path" affordance is enabled in Settings, so call sites can drop it
 * in unconditionally. The full path is exposed via `title` for long, truncated
 * paths.
 */
export function FilePathLabel({ filePath, className = '' }: { filePath: string; className?: string }) {
  const { showFilePath, vaultPath } = useTaskStore(
    useShallow((s) => ({ showFilePath: s.showFilePath, vaultPath: s.vaultPath })),
  );
  if (!showFilePath || !filePath) return null;
  const rel = toVaultRelativePath(filePath, vaultPath);
  return (
    <span
      className={`text-[11px] text-[#C0C0C0] dark:text-[#555] truncate ${className}`}
      title={rel}
    >
      {rel}
    </span>
  );
}
