import { describe, it, expect } from 'vitest';
import { buildTagTree } from './tagTree';
import type { TagInfo, Task } from '../types/task';

const tag = (name: string): TagInfo => ({ name, count: 0 });
// Minimal task factory — only the fields buildTagTree reads.
const task = (tags: string[], completed = false): Task =>
  ({ tags, completed } as unknown as Task);

describe('buildTagTree', () => {
  it('synthesizes parent nodes that are not tags themselves', () => {
    const tree = buildTagTree([tag('inbox/to-read'), tag('inbox/processing')], []);
    expect(tree.map((n) => n.name)).toEqual(['inbox']);
    expect(tree[0].children.map((c) => c.label)).toEqual(['processing', 'to-read']);
  });

  it('counts each task once per ancestor (no double counting)', () => {
    const tasks = [
      task(['inbox/to-read', 'inbox/processing']), // touches inbox once, each child once
      task(['inbox/to-read']),
      task(['inbox']),
    ];
    const tree = buildTagTree(
      [tag('inbox'), tag('inbox/to-read'), tag('inbox/processing')],
      tasks,
    );
    const inbox = tree.find((n) => n.name === 'inbox')!;
    expect(inbox.count).toBe(3); // all three tasks are in the subtree
    const toRead = inbox.children.find((c) => c.label === 'to-read')!;
    expect(toRead.count).toBe(2);
    const processing = inbox.children.find((c) => c.label === 'processing')!;
    expect(processing.count).toBe(1);
  });

  it('ignores completed tasks in counts', () => {
    const tree = buildTagTree([tag('inbox')], [task(['inbox'], true), task(['inbox'])]);
    expect(tree[0].count).toBe(1);
  });

  it('keeps flat tags as roots with no children', () => {
    const tree = buildTagTree([tag('work'), tag('home')], []);
    expect(tree.map((n) => n.name)).toEqual(['home', 'work']);
    expect(tree.every((n) => n.children.length === 0)).toBe(true);
  });
});
