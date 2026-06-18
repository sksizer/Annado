import { useState, useEffect, useRef } from 'react';
import { modalShadow } from '../utils/styles';
import { useFocusWhen } from '../hooks/useFocus';
import { useTaskStore } from '../stores/taskStore';
import { IntervalUnit, RecurrenceMode, Task } from '../types/task';
import { ProjectSelector } from './ProjectSelector';
import { PrioritySelector } from './PrioritySelector';

interface RecurringTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  editTask?: Task | null;
}

export function RecurringTaskModal({ isOpen, onClose, editTask }: RecurringTaskModalProps) {
  const { createTask, updateTask } = useTaskStore();
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [mode, setMode] = useState<RecurrenceMode>('fixed');
  const [interval, setInterval] = useState(1);
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>('days');
  const [whenDate, setWhenDate] = useState<string>('');
  const [project, setProject] = useState<string>('');
  const [priority, setPriority] = useState<number | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wasOpenRef = useRef(false);

  useFocusWhen(inputRef, isOpen);

  const getTodayString = () => new Date().toISOString().split('T')[0];

  // A rule outside Annado's modeled subset (e.g. "every weekday") is round-tripped
  // verbatim and not auto-advanced — show it read-only.
  const rawRule = editTask?.recurrence?.raw ?? null;
  const whenAsDate = (t: Task): string =>
    typeof t.when === 'object' && t.when && 'date' in t.when ? t.when.date : '';

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      wasOpenRef.current = true;

      if (editTask) {
        setTitle(editTask.title);
        setNotes(editTask.notes);
        setMode(editTask.recurrence?.mode ?? 'fixed');
        setInterval(editTask.recurrence?.interval ?? 1);
        setIntervalUnit(editTask.recurrence?.unit ?? 'days');
        setWhenDate(whenAsDate(editTask) || getTodayString());
        setProject(editTask.projects[0] || '');
        setPriority(editTask.priority);
        setShowNotes(!!editTask.notes);
      } else {
        setTitle('');
        setNotes('');
        setMode('fixed');
        setInterval(1);
        setIntervalUnit('days');
        setWhenDate(getTodayString());
        setProject('');
        setPriority(null);
        setShowNotes(false);
      }
    } else if (!isOpen) {
      wasOpenRef.current = false;
    }
  }, [isOpen, editTask]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const recurrence = { interval, unit: intervalUnit, mode, raw: rawRule };

    try {
      if (editTask) {
        await updateTask({
          id: editTask.id,
          title: title.trim(),
          notes: notes.trim(),
          when: whenDate ? { date: whenDate } : undefined,
          projects: project ? [project] : [],
          priority,
          recurrence,
        });
      } else {
        const created = await createTask({
          title: title.trim(),
          when: whenDate ? { date: whenDate } : undefined,
        });
        await updateTask({
          id: created.id,
          notes: notes.trim(),
          projects: project ? [project] : [],
          priority,
          recurrence,
        });
      }
      onClose();
    } catch (error) {
      console.error('Failed to save recurring task:', error);
    }
  };

  const handleRemoveRecurrence = async () => {
    if (!editTask) return;
    try {
      await updateTask({ id: editTask.id, recurrence: null });
      onClose();
    } catch (error) {
      console.error('Failed to remove recurrence:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20 dark:bg-black/40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className={`task-expanded relative w-full max-w-xl mx-4 bg-white dark:bg-[#2A2A2A] rounded-xl ${modalShadow}`}>
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="px-5 py-3 border-b border-[#E8E8E8] dark:border-[#3A3A3A] flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-[#1A1A1A] dark:text-[#E8E8E8]">
              {editTask ? 'Edit Recurring Task' : 'New Recurring Task'}
            </h2>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>

          {/* Title input */}
          <div className="flex items-start gap-4 px-5 py-4">
            {/* Recurring icon placeholder */}
            <div className="mt-1 w-[20px] h-[20px] rounded-full border-[1.5px] border-success flex-shrink-0 flex items-center justify-center">
              <svg className="w-3 h-3 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            {/* Title */}
            <input
              ref={inputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Recurring task title"
              className="task-input flex-1 text-[15px] bg-transparent text-[#1A1A1A] dark:text-[#E8E8E8] placeholder-[#A0A0A0] dark:placeholder-[#666] focus:outline-none font-normal"
            />
          </div>

          {/* Notes */}
          <div className="px-5 pb-4 pl-14">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setShowNotes(true)}
              rows={showNotes ? 3 : 1}
              placeholder="Notes"
              className="task-input w-full text-[14px] text-[#555] dark:text-[#999] bg-transparent focus:outline-none resize-none placeholder-[#AAA] dark:placeholder-[#666] leading-relaxed"
            />
          </div>

          {/* When (next occurrence) date */}
          <div className="px-5 pb-4 flex items-center gap-3">
            <span className="text-[12px] text-[#888] dark:text-[#666]">Next on:</span>
            <input
              type="date"
              value={whenDate}
              onChange={(e) => setWhenDate(e.target.value)}
              className="text-[12px] px-2 py-1 rounded border border-[#E8E8E8] dark:border-[#3A3A3A] bg-white dark:bg-[#333] text-[#1A1A1A] dark:text-[#E0E0E0] focus:outline-none focus:border-success"
            />
          </div>

          {/* Recurrence settings */}
          {rawRule ? (
            <div className="px-5 pb-4">
              <div className="text-[12px] text-[#888] dark:text-[#666]">
                Rule: <span className="font-mono text-[#1A1A1A] dark:text-[#E0E0E0]">{rawRule}</span>
              </div>
              <div className="text-[11px] text-[#A0A0A0] dark:text-[#666] mt-1">
                Annado preserves this rule but doesn’t auto-advance it (the Obsidian Tasks plugin does).
              </div>
            </div>
          ) : (
            <div className="px-5 pb-4 space-y-3">
              <div className="flex items-center gap-4">
                {/* Recurrence mode toggle */}
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-[#888] dark:text-[#666]">Type:</span>
                  <div className="flex rounded-lg border border-[#E8E8E8] dark:border-[#3A3A3A] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setMode('fixed')}
                      className={`px-3 py-1.5 text-[12px] transition-colors ${
                        mode === 'fixed'
                          ? 'bg-success text-white'
                          : 'bg-white dark:bg-[#333] text-[#555] dark:text-[#999] hover:bg-[#F5F5F5] dark:hover:bg-[#3A3A3A]'
                      }`}
                    >
                      Fixed
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('when_done')}
                      className={`px-3 py-1.5 text-[12px] transition-colors ${
                        mode === 'when_done'
                          ? 'bg-success text-white'
                          : 'bg-white dark:bg-[#333] text-[#555] dark:text-[#999] hover:bg-[#F5F5F5] dark:hover:bg-[#3A3A3A]'
                      }`}
                    >
                      When Done
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-[12px] text-[#888] dark:text-[#666]">Every</span>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={interval}
                  onChange={(e) => setInterval(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-16 text-[12px] px-2 py-1 rounded border border-[#E8E8E8] dark:border-[#3A3A3A] bg-white dark:bg-[#333] text-[#1A1A1A] dark:text-[#E0E0E0] focus:outline-none text-center"
                />
                <select
                  value={intervalUnit}
                  onChange={(e) => setIntervalUnit(e.target.value as IntervalUnit)}
                  className="task-input text-[12px] px-2 py-1 rounded border border-[#E8E8E8] dark:border-[#3A3A3A] bg-white dark:bg-[#333] text-[#1A1A1A] dark:text-[#E0E0E0] focus:outline-none cursor-pointer"
                >
                  <option value="days">{interval === 1 ? 'day' : 'days'}</option>
                  <option value="weeks">{interval === 1 ? 'week' : 'weeks'}</option>
                  <option value="months">{interval === 1 ? 'month' : 'months'}</option>
                  <option value="years">{interval === 1 ? 'year' : 'years'}</option>
                </select>
                <span className="text-[12px] text-[#888] dark:text-[#666]">
                  {mode === 'fixed' ? 'on schedule' : 'after completion'}
                </span>
              </div>
            </div>
          )}

          {/* Bottom toolbar */}
          <div className="flex items-center justify-between px-5 py-3 bg-[#FAFAFA] dark:bg-[#252525] rounded-b-xl">
            <div className="flex items-center gap-3">
              {/* Project selector */}
              <ProjectSelector value={project} onChange={setProject} />

              {/* Priority selector */}
              <PrioritySelector value={priority} onChange={setPriority} />
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              {editTask && (
                <button
                  type="button"
                  onClick={handleRemoveRecurrence}
                  className="px-3 py-1.5 text-[12px] rounded transition-colors text-danger hover:bg-[#FFEBEE] dark:hover:bg-[#4A2020]"
                >
                  Remove recurrence
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-[12px] text-[#888] dark:text-[#666] hover:text-[#1A1A1A] dark:hover:text-[#E0E0E0] transition-colors rounded"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!title.trim()}
                className="px-4 py-1.5 text-[12px] bg-success text-white rounded-lg hover:bg-[#388E3C] disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {editTask ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
