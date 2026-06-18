import { ReactNode } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/**
 * Drag props the consumer spreads onto whatever should initiate the drag — the whole
 * row, or just a grip handle (so inline controls stay clickable).
 */
export type DragHandleProps = Record<string, unknown>;

interface SortableListProps {
  /** Stable ids in current order. */
  ids: string[];
  /** Called when an item is dropped on a different position. */
  onReorder: (fromId: string, toId: string) => void;
  children: ReactNode;
}

/**
 * A vertical sortable list. Owns the dnd-kit wiring (DndContext + SortableContext +
 * a PointerSensor with an 8px activation distance, so a click still registers as a
 * click). Render `SortableItem`s as children.
 */
export function SortableList({ ids, onReorder, children }: SortableListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorder(String(active.id), String(over.id));
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

interface SortableItemProps {
  id: string;
  /**
   * Render the row content. Spread `handleProps` on the element that should start the
   * drag — the whole row (whole-row drag) or a dedicated grip handle.
   */
  children: (args: { handleProps: DragHandleProps }) => ReactNode;
}

/**
 * One sortable row. Applies the transform/transition/opacity to its container and hands
 * `handleProps` to the consumer so it decides where the drag activates.
 */
export function SortableItem({ id, children }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ handleProps: { ...attributes, ...listeners } })}
    </div>
  );
}
