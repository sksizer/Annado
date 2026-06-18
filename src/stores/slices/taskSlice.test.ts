import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DeletedTaskSnapshot, Task } from '../../types/task';

// Mock the Tauri bridge before importing anything that pulls in the store.
// `invoke` is the only call we assert on; `listen` is mocked because the task
// slice imports it at module load (setupEventListeners).
const invokeMock = vi.fn();
const listenMock = vi.fn().mockResolvedValue(() => {});

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: unknown[]) => listenMock(...args),
}));

import { useTaskStore } from '../../stores/taskStore';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'abc123',
    title: 'Buy groceries',
    notes: '',
    when: 'inbox',
    deadline: null,
    tags: [],
    checklist: [],
    completed: false,
    completedDate: null,
    createdDate: null,
    filePath: '/vault/Tasks.md',
    lineNumber: 4,
    projects: [],
    indentLevel: 0,
    priority: null,
    persons: [],
    recurringTemplateId: null,
    durationMinutes: null,
    scheduledTime: null,
    ...overrides,
  };
}

const SNAPSHOT: DeletedTaskSnapshot = {
  filePath: '/vault/Tasks.md',
  lineNumber: 4,
  rawBlock: '- [ ] Buy groceries\n    a note',
};

describe('taskSlice deleteTask / undo wiring', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    // Start each test from a clean slice state.
    useTaskStore.setState({ tasks: [makeTask()], undoStack: [] });
  });

  it('pushes exactly one undo entry whose execution invokes restore_task with the snapshot', async () => {
    // delete_task returns the snapshot the undo entry must replay.
    invokeMock.mockResolvedValueOnce(SNAPSHOT); // delete_task

    await useTaskStore.getState().deleteTask('abc123');

    // Optimistic remove happened.
    expect(useTaskStore.getState().tasks.find((t) => t.id === 'abc123')).toBeUndefined();

    // delete_task was called with the id.
    expect(invokeMock).toHaveBeenCalledWith('delete_task', { id: 'abc123' });

    // Exactly one undo entry was recorded.
    const stack = useTaskStore.getState().undoStack;
    expect(stack).toHaveLength(1);

    // Executing that entry restores the task via restore_task + the snapshot.
    const restored = makeTask();
    invokeMock.mockResolvedValueOnce(restored); // restore_task
    await stack[0].run();

    expect(invokeMock).toHaveBeenCalledWith('restore_task', { snapshot: SNAPSHOT });
    expect(useTaskStore.getState().tasks.find((t) => t.id === 'abc123')).toEqual(restored);
  });

  it('records no undo entry when delete_task fails (rollback path)', async () => {
    invokeMock.mockRejectedValueOnce(new Error('boom'));

    // storeError re-throws after recording the error (matches the other slice
    // actions), so the rejection surfaces here.
    await expect(useTaskStore.getState().deleteTask('abc123')).rejects.toThrow('boom');

    // No undo entry, and the optimistic remove was rolled back.
    expect(useTaskStore.getState().undoStack).toHaveLength(0);
    expect(useTaskStore.getState().tasks.find((t) => t.id === 'abc123')).toBeDefined();
  });
});
