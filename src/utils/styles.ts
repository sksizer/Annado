export const formInputClass = 'w-full text-[14px] bg-[#F5F5F5] dark:bg-[#333] border border-[#E8E8E8] dark:border-[#3A3A3A] rounded-lg px-3 py-2 text-[#1A1A1A] dark:text-[#E0E0E0] placeholder-[#999] dark:placeholder-[#666] focus:outline-none focus:border-[#5C6BC0]';
export const formLabelClass = 'block text-[11px] font-medium text-[#888] uppercase tracking-wide mb-1.5';

export const modalShadow = 'shadow-[0_8px_40px_rgba(0,0,0,0.12),0_2px_12px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_40px_rgba(0,0,0,0.5),0_2px_12px_rgba(0,0,0,0.3)]';

/** A filled, rounded "chip row" — shared by Settings list rows (excluded paths, the
 * import-marker tag field, etc.). Add the flex layout (justify-between / gap) per use. */
export const filledRowClass = 'px-3 py-1.5 bg-[#FAFAFA] dark:bg-[#2F2F2F] rounded-lg';

/** Secondary-button surface: white fill, hairline border, subtle hover. Shared by the welcome
 * screen's "Start fresh" button and "Back to vault" pill. Add radius / padding / text color
 * per use (kept out so per-button text-hover overrides stay reliable). */
export const secondarySurfaceClass =
  'bg-white dark:bg-[#262626] border border-[#E3E0D8] dark:border-[#3A3A3A] hover:bg-[#F6F4EF] dark:hover:bg-[#2F2F2F] transition-colors';

/** Small inline secondary action button used in Settings rows (e.g. "Switch vault", "Change…").
 * A primary-tinted outline that reads as tappable without competing with the filled primary CTAs. */
export const inlineActionButtonClass =
  'px-3 py-1.5 text-[12px] font-medium text-primary border border-primary/40 rounded-lg hover:bg-primary/10 transition-colors whitespace-nowrap';
