import { useState, useEffect } from 'react';
import { modalShadow } from '../utils/styles';
import { useTaskStore } from '../stores/taskStore';
import { MigrationReport } from '../types/task';

interface MigrateRecurrenceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MigrateRecurrenceModal({ isOpen, onClose }: MigrateRecurrenceModalProps) {
  const { migrateRecurrenceDryRun, migrateRecurrenceApply } = useTaskStore();
  const [report, setReport] = useState<MigrationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<MigrationReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setReport(null);
      setApplied(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    migrateRecurrenceDryRun()
      .then(setReport)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [isOpen]);

  const handleApply = async () => {
    setApplying(true);
    setError(null);
    try {
      const result = await migrateRecurrenceApply();
      setApplied(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setApplying(false);
    }
  };

  if (!isOpen) return null;

  const nothingToMigrate = report !== null && report.templates === 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh]">
      <div className="absolute inset-0 bg-black/20 dark:bg-black/40" onClick={onClose} />

      <div className={`relative w-full max-w-lg mx-4 bg-white dark:bg-[#2A2A2A] rounded-xl ${modalShadow}`}>
        {/* Header */}
        <div className="px-5 py-3 border-b border-[#E8E8E8] dark:border-[#3A3A3A]">
          <h2 className="text-[14px] font-semibold text-[#1A1A1A] dark:text-[#E8E8E8]">
            Convert recurring tasks
          </h2>
        </div>

        <div className="px-5 py-4 text-[13px] text-[#444] dark:text-[#C0C0C0] space-y-3">
          {loading && <p className="text-[#888] dark:text-[#777]">Scanning vault…</p>}

          {error && (
            <p className="text-danger text-[12px]">{error}</p>
          )}

          {applied ? (
            <div className="space-y-2">
              <p className="text-success font-medium">Done.</p>
              <ul className="text-[12px] text-[#666] dark:text-[#999] list-disc pl-5 space-y-1">
                <li>{applied.templates} template{applied.templates === 1 ? '' : 's'} converted</li>
                <li>{applied.instancesDeorphaned} completed instance{applied.instancesDeorphaned === 1 ? '' : 's'} kept (marker stripped)</li>
                <li>{applied.instancesRemoved} uncompleted instance{applied.instancesRemoved === 1 ? '' : 's'} collapsed</li>
                {applied.backupPath && <li>Backup created at <span className="font-mono break-all">{applied.backupPath}</span></li>}
              </ul>
            </div>
          ) : nothingToMigrate ? (
            <p>No legacy recurring templates found — nothing to migrate.</p>
          ) : report ? (
            <div className="space-y-3">
              <p>
                This converts the old template-based recurring tasks into the new inline
                <span className="font-mono"> @repeat(…)</span> format.
              </p>
              <ul className="text-[12px] text-[#666] dark:text-[#999] list-disc pl-5 space-y-1">
                <li>{report.templates} template{report.templates === 1 ? '' : 's'} → {report.newTasks.length} inline recurring task{report.newTasks.length === 1 ? '' : 's'}</li>
                <li>{report.instancesDeorphaned} completed instance{report.instancesDeorphaned === 1 ? '' : 's'} kept as history</li>
                <li>{report.instancesRemoved} uncompleted instance{report.instancesRemoved === 1 ? '' : 's'} collapsed</li>
              </ul>
              {report.newTasks.length > 0 && (
                <div>
                  <p className="text-[11px] text-[#888] dark:text-[#666] uppercase tracking-wider mb-1">New tasks</p>
                  <pre className="text-[11px] font-mono bg-[#F7F7F7] dark:bg-[#1F1F1F] rounded p-2 max-h-40 overflow-auto whitespace-pre-wrap">
{report.newTasks.join('\n')}
                  </pre>
                </div>
              )}
              <p className="text-[11px] text-[#888] dark:text-[#666]">
                A full backup of the vault is created before any changes are made.
              </p>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 bg-[#FAFAFA] dark:bg-[#252525] rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-[12px] text-[#888] dark:text-[#666] hover:text-[#1A1A1A] dark:hover:text-[#E0E0E0] transition-colors rounded"
          >
            {applied ? 'Close' : 'Cancel'}
          </button>
          {!applied && !nothingToMigrate && report && (
            <button
              type="button"
              onClick={handleApply}
              disabled={applying}
              className="px-4 py-1.5 text-[12px] bg-success text-white rounded-lg hover:bg-[#388E3C] disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {applying ? 'Converting…' : 'Convert & back up'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
