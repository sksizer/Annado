interface DeleteIconProps {
  className?: string;
  strokeWidth?: number;
}

// Shared trash-2 glyph for every destructive/delete affordance (task detail, bulk bar, …).
// Color and size come from `className` (stroke uses currentColor).
export function DeleteIcon({ className, strokeWidth = 1.75 }: DeleteIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
