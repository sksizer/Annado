import { useState, useEffect } from 'react';
import { modalShadow } from '../utils/styles';
import { useTaskStore } from '../stores/taskStore';
import { TaskFormat, TaskFormatDetection } from '../types/task';

interface FormatPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** First run shows the "detected your vault" framing; Settings shows a plain picker. */
  firstRun?: boolean;
}

interface FormatOption {
  id: TaskFormat;
  name: string;
  example: string;
  detectedCount: (d: TaskFormatDetection) => number;
}

const OPTIONS: FormatOption[] = [
  {
    id: 'annado',
    name: 'Annado',
    example: '- [ ] Pay rent @due(2026-07-01) !(1) @repeat(every 2 weeks)',
    detectedCount: (d) => d.annado,
  },
  {
    id: 'obsidian_tasks',
    name: 'Obsidian Tasks',
    example: '- [ ] Pay rent 📅 2026-07-01 ⏫ 🔁 every 2 weeks',
    detectedCount: (d) => d.obsidianTasks,
  },
  {
    id: 'dataview',
    name: 'Dataview',
    example: '- [ ] Pay rent [due:: 2026-07-01] [priority:: high] [repeat:: every 2 weeks]',
    detectedCount: (d) => d.dataview,
  },
];

export function FormatPickerModal({ isOpen, onClose, firstRun = false }: FormatPickerModalProps) {
  const { detectTaskFormat, setTaskFormat, taskFormat, dismissFormatPicker } = useTaskStore();
  const [detection, setDetection] = useState<TaskFormatDetection | null>(null);
  const [selected, setSelected] = useState<TaskFormat>('annado');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setDetection(null);
      return;
    }
    // Pre-select the current format if set, otherwise wait for detection.
    if (taskFormat) setSelected(taskFormat as TaskFormat);
    detectTaskFormat()
      .then((d) => {
        setDetection(d);
        if (!taskFormat) setSelected(d.suggested);
      })
      .catch(() => setDetection(null));
  }, [isOpen]);

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await setTaskFormat(selected);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDismiss = () => {
    dismissFormatPicker();
    onClose();
  };

  if (!isOpen) return null;

  const suggested = detection?.suggested;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[10vh]">
      <div className="absolute inset-0 bg-black/20 dark:bg-black/40" onClick={handleDismiss} />

      <div className={`relative w-full max-w-xl mx-4 bg-white dark:bg-[#2A2A2A] rounded-xl ${modalShadow}`}>
        {/* Header */}
        <div className="px-5 py-3 border-b border-[#E8E8E8] dark:border-[#3A3A3A]">
          <h2 className="text-[14px] font-semibold text-[#1A1A1A] dark:text-[#E8E8E8]">
            Task format
          </h2>
          <p className="text-[12px] text-[#888] dark:text-[#777] mt-1">
            {firstRun && suggested
              ? `Annado reads every format. Your vault looks like ${OPTIONS.find((o) => o.id === suggested)?.name}. Which format should Annado write?`
              : 'Annado reads every format. Choose which one to write when you edit a task.'}
          </p>
        </div>

        {/* Options */}
        <div className="px-5 py-4 space-y-2">
          {OPTIONS.map((opt) => {
            const isSelected = selected === opt.id;
            const isSuggested = suggested === opt.id;
            const count = detection ? opt.detectedCount(detection) : 0;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSelected(opt.id)}
                className={`w-full text-left rounded-lg border px-4 py-3 transition-colors ${
                  isSelected
                    ? 'border-primary bg-primary/5'
                    : 'border-[#E8E8E8] dark:border-[#3A3A3A] hover:bg-[#F7F7F7] dark:hover:bg-[#252525]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-[#1A1A1A] dark:text-[#E8E8E8]">
                      {opt.name}
                    </span>
                    {isSuggested && (
                      <span className="text-[10px] font-semibold text-primary bg-primary/10 rounded px-1.5 py-0.5">
                        Recommended
                      </span>
                    )}
                  </div>
                  {detection && count > 0 && (
                    <span className="text-[11px] text-[#888] dark:text-[#666]">
                      {count} in vault
                    </span>
                  )}
                </div>
                <pre className="mt-1.5 text-[11px] font-mono text-[#555] dark:text-[#999] whitespace-pre-wrap break-all">
{opt.example}
                </pre>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 bg-[#FAFAFA] dark:bg-[#252525] rounded-b-xl">
          <button
            type="button"
            onClick={handleDismiss}
            className="px-3 py-1.5 text-[12px] text-[#888] dark:text-[#666] hover:text-[#1A1A1A] dark:hover:text-[#E0E0E0] transition-colors rounded"
          >
            {firstRun ? 'Decide later' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving}
            className="px-4 py-1.5 text-[12px] bg-primary text-white rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity font-medium"
          >
            {saving ? 'Saving…' : 'Use this format'}
          </button>
        </div>
      </div>
    </div>
  );
}
