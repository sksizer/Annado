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
    inheritedTags: [],
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
    recurrence: null,
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

  it('clears expanded + selected view state when the deleted task was open in the expanded view', async () => {
    invokeMock.mockResolvedValueOnce(SNAPSHOT); // delete_task

    // The task is open in the expanded editor and selected (the state the
    // expanded-card Delete button operates from).
    useTaskStore.setState({
      tasks: [makeTask()],
      undoStack: [],
      expandedTaskId: 'abc123',
      selectedTaskId: 'abc123',
      selectedTaskIds: ['abc123'],
    });

    await useTaskStore.getState().deleteTask('abc123');

    const s = useTaskStore.getState();
    expect(s.tasks.find((t) => t.id === 'abc123')).toBeUndefined(); // removed from the list
    expect(s.expandedTaskId).toBeNull(); // expanded card collapses
    expect(s.selectedTaskId).toBeNull();
    expect(s.selectedTaskIds).toEqual([]);
  });

  it('leaves an unrelated expanded/selected task untouched when a different task is deleted', async () => {
    invokeMock.mockResolvedValueOnce(SNAPSHOT); // delete_task

    useTaskStore.setState({
      tasks: [makeTask(), makeTask({ id: 'other', lineNumber: 9 })],
      undoStack: [],
      expandedTaskId: 'other',
      selectedTaskId: 'other',
      selectedTaskIds: ['other'],
    });

    await useTaskStore.getState().deleteTask('abc123');

    const s = useTaskStore.getState();
    expect(s.expandedTaskId).toBe('other'); // unrelated expansion preserved
    expect(s.selectedTaskId).toBe('other');
    expect(s.selectedTaskIds).toEqual(['other']);
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

describe('taskSlice deleteMultipleTasks (line-safe order + batch undo)', () => {
  const FILE = '/vault/Tasks.md';
  const snap = (lineNumber: number): DeletedTaskSnapshot => ({
    filePath: FILE, lineNumber, rawBlock: `- [ ] task L${lineNumber}`,
  });
  const idsOf = (name: string) =>
    invokeMock.mock.calls.filter((c) => c[0] === name).map((c) => (c[1] as { id: string }).id);
  const restoreLines = () =>
    invokeMock.mock.calls
      .filter((c) => c[0] === 'restore_task')
      .map((c) => (c[1] as { snapshot: DeletedTaskSnapshot }).snapshot.lineNumber);

  beforeEach(() => {
    invokeMock.mockReset();
    // Three tasks in the SAME file at lines 3, 5, 8 — the case that broke bulk delete.
    useTaskStore.setState({
      tasks: [
        makeTask({ id: 't3', lineNumber: 3 }),
        makeTask({ id: 't8', lineNumber: 8 }),
        makeTask({ id: 't5', lineNumber: 5 }),
      ],
      undoStack: [],
    });
  });

  it('deletes highest line first within a file (so shifted lines never go out of bounds)', async () => {
    invokeMock
      .mockResolvedValueOnce(snap(8)) // delete t8
      .mockResolvedValueOnce(snap(5)) // delete t5
      .mockResolvedValueOnce(snap(3)); // delete t3

    await useTaskStore.getState().deleteMultipleTasks(['t3', 't8', 't5']);

    expect(idsOf('delete_task')).toEqual(['t8', 't5', 't3']);
    expect(useTaskStore.getState().tasks).toHaveLength(0);
  });

  it('pushes one undo entry that restores the whole batch ascending (original positions)', async () => {
    invokeMock
      .mockResolvedValueOnce(snap(8))
      .mockResolvedValueOnce(snap(5))
      .mockResolvedValueOnce(snap(3));

    await useTaskStore.getState().deleteMultipleTasks(['t3', 't8', 't5']);

    const stack = useTaskStore.getState().undoStack;
    expect(stack).toHaveLength(1); // one ⌘Z undoes the whole batch

    // Running it restores every snapshot, lowest line first so each block lands home.
    invokeMock
      .mockResolvedValueOnce(makeTask({ id: 't3', lineNumber: 3 }))
      .mockResolvedValueOnce(makeTask({ id: 't5', lineNumber: 5 }))
      .mockResolvedValueOnce(makeTask({ id: 't8', lineNumber: 8 }));
    await stack[0].run();

    expect(restoreLines()).toEqual([3, 5, 8]);
    expect(useTaskStore.getState().tasks).toHaveLength(3);
  });
});
