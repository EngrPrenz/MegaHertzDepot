import { Moon, Sun } from 'lucide-react';
import { useColorScheme } from '../hooks/useColorScheme.js';

interface ThemeToggleButtonProps {
  className?: string;
}

export function ThemeToggleButton({ className = '' }: ThemeToggleButtonProps) {
  const { toggle } = useColorScheme();

  return (
    <button
      type="button"
      onClick={toggle}
      data-testid="theme-toggle-btn"
      title="Toggle light or dark appearance"
      className={`p-1.5 sm:px-2 sm:py-1.5 rounded-md bg-white dark:bg-carbon border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-950 dark:hover:text-white inline-flex items-center justify-center transition-colors cursor-pointer shrink-0 ${className}`}
    >
      <span className="inline-flex items-center dark:hidden">
        <Moon className="w-3.5 h-3.5" strokeWidth={1.75} />
        <span className="sr-only">Switch to dark theme</span>
      </span>
      <span className="hidden dark:inline-flex items-center">
        <Sun className="w-3.5 h-3.5 text-amber-400" strokeWidth={1.75} />
        <span className="sr-only">Switch to light theme</span>
      </span>
    </button>
  );
}
