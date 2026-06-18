import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useTaskStore } from '../stores/taskStore';
import { secondarySurfaceClass } from '../utils/styles';

/** Annado brand mark (rounded card + quill stroke), from the welcome design handoff. */
function BrandIcon() {
  return (
    <svg
      width="72"
      height="72"
      viewBox="0 0 1024 1024"
      className="mx-auto mb-7 drop-shadow-lg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="annadoBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F7F5F2" />
          <stop offset="100%" stopColor="#ECEAE6" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="224" ry="224" fill="url(#annadoBg)" stroke="#e2ddd2" strokeWidth={2} />
      <g transform="translate(400, 520)">
        <path d="M60,-160 C-80,-160 -210,-80 -210,30 C-210,140 -120,200 -10,200 C80,200 136,144 156,84" fill="none" stroke="#1a1a1a" strokeWidth={56} strokeLinecap="round" />
        <path d="M156,-160 L156,20" fill="none" stroke="#1a1a1a" strokeWidth={56} strokeLinecap="round" />
        <path d="M156,20 L156,200 L336,-20" fill="none" stroke="#D4634B" strokeWidth={56} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

// Illustrative date used across all three formats so the showcase reads as "the same task".
const SHOWCASE_EXAMPLES: { label: string; marker: string }[] = [
  { label: 'Annado', marker: '@due(2026-06-18)' },
  { label: 'Obsidian Tasks', marker: '📅 2026-06-18' },
  { label: 'Dataview', marker: '[due:: 2026-06-18]' },
];

/** Cycles through the supported checkbox formats to show "we read what you already use". */
function FormatShowcase() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % SHOWCASE_EXAMPLES.length);
    }, 2800);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="mt-12 flex flex-col items-center gap-3.5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-[#B0B0B0] dark:text-[#666]">
        Reads the checkbox formats you already use
      </div>
      <div className="relative w-[340px] h-[58px]">
        {SHOWCASE_EXAMPLES.map((example, i) => (
          <div
            key={example.label}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 transition-opacity duration-700"
            style={{ opacity: i === index ? 1 : 0 }}
            aria-hidden={i !== index}
          >
            <div className="font-mono text-[10px] font-medium uppercase tracking-wider text-[#A0A0A0] dark:text-[#666]">
              {example.label}
            </div>
            <div className="px-4 py-2.5 rounded-lg bg-[#F3F1EC] dark:bg-[#262626] border border-[#ECE9E2] dark:border-[#333] font-mono text-[12.5px] whitespace-nowrap text-[#8A877F] dark:text-[#999]">
              <span className="text-primary">- [ ]</span> Buy groceries{' '}
              <span className="text-[#C2694A]">{example.marker}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function VaultSelector() {
  const { vaultPath, setVaultPath, createVault, setShowWelcome, isLoading, error } = useTaskStore();
  const [localError, setLocalError] = useState<string | null>(null);

  // When a vault is already loaded we got here via Settings → Switch vault, so offer a way back.
  const currentVaultName = vaultPath?.split('/').pop();

  const handleOpenVault = async () => {
    try {
      setLocalError(null);
      const selected = await open({ directory: true, title: 'Select your vault folder' });
      if (selected && typeof selected === 'string') {
        await setVaultPath(selected);
      }
    } catch (err) {
      setLocalError(String(err));
    }
  };

  const handleStartFresh = async () => {
    try {
      setLocalError(null);
      const selected = await open({ directory: true, title: 'Choose a location for your new vault' });
      if (selected && typeof selected === 'string') {
        await createVault(selected);
      }
    } catch (err) {
      setLocalError(String(err));
    }
  };

  return (
    <div className="relative h-screen w-full flex items-center justify-center bg-[#FAFAFA] dark:bg-[#1A1A1A]">
      {currentVaultName && (
        <button
          onClick={() => setShowWelcome(false)}
          className={`absolute top-11 left-5 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full shadow-sm text-[12px] font-medium text-[#666] dark:text-[#999] hover:text-[#1A1A1A] dark:hover:text-[#E8E8E8] ${secondarySurfaceClass}`}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to {currentVaultName}
        </button>
      )}

      <div className="text-center max-w-md px-8">
        <BrandIcon />

        <h1 className="text-[28px] font-bold text-[#1A1A1A] dark:text-[#E8E8E8] tracking-tight mb-3">
          Welcome to Annado
        </h1>
        <p className="text-[15px] text-[#74726B] dark:text-[#888] mb-9 leading-relaxed">
          A task manager for your markdown files.
        </p>

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={handleOpenVault}
            disabled={isLoading}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-xl hover:bg-[#4A5AAF] disabled:opacity-50 transition-colors font-medium text-[14px] shadow-sm"
          >
            <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none">
              <path d="M3 8a2 2 0 0 1 2-2h3l1.6 2H19a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" />
            </svg>
            {isLoading ? 'Loading…' : 'Open a vault'}
          </button>
          <button
            onClick={handleStartFresh}
            disabled={isLoading}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[14px] font-medium text-[#33322E] dark:text-[#E0E0E0] disabled:opacity-50 ${secondarySurfaceClass}`}
          >
            <svg className="w-[18px] h-[18px] text-primary" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
            </svg>
            Start fresh
          </button>
        </div>

        <p className="mt-5 text-[13px] text-[#9C9A92] dark:text-[#666] leading-relaxed max-w-[380px] mx-auto">
          Point Annado at a folder of markdown files (a vault), or start fresh and we'll set up
          your first task file.
        </p>

        {(error || localError) && (
          <p className="mt-4 text-[13px] text-danger">{error || localError}</p>
        )}

        <FormatShowcase />
      </div>
    </div>
  );
}
