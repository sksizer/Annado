import { useMemo } from 'react';
import { useTaskStore } from '../stores/taskStore';
import { WikilinkProps } from '../components/MarkdownNotesRenderer';

type Handlers = Partial<Pick<WikilinkProps, 'onPersonClick' | 'onProjectClick' | 'onRemoveLink'>>;

const noop = () => {};

// Single source for the wikilink/link context that InlineMarkdown (and MarkdownNotesRenderer)
// need. Pulls person/project names, colors and vault flag from the store so every call site
// — task titles, subtasks, notes, agenda, review cards — renders markdown identically.
// Pass click handlers where the context wants them; they default to no-ops.
export function useWikilinkProps(handlers: Handlers = {}): WikilinkProps {
  const availablePeople = useTaskStore((s) => s.availablePeople);
  const availableProjects = useTaskStore((s) => s.availableProjects);
  const projectColors = useTaskStore((s) => s.projectColors);
  const isObsidianVault = useTaskStore((s) => s.isObsidianVault);

  const personNames = useMemo(() => new Set(availablePeople.map((p) => p.name)), [availablePeople]);
  const projectNames = useMemo(() => new Set(availableProjects.map((p) => p.name)), [availableProjects]);

  const { onPersonClick = noop, onProjectClick = noop, onRemoveLink } = handlers;

  return useMemo(() => ({
    personNames,
    projectNames,
    onPersonClick,
    onProjectClick,
    onRemoveLink,
    projectColors,
    availableProjects,
    isObsidianVault,
  }), [personNames, projectNames, onPersonClick, onProjectClick, onRemoveLink, projectColors, availableProjects, isObsidianVault]);
}
