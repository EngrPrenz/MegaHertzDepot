import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl';
  children: React.ReactNode;
}

const MAX_WIDTH_MAP = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
};

/**
 * Accessible native `<dialog>` modal with `closedby="any"` and light-dismiss fallback
 * for browsers without `HTMLDialogElement.prototype.closedBy` support (Safari).
 */
export function ModalDialog({
  open,
  onClose,
  title,
  subtitle,
  maxWidth = 'md',
  children,
}: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open && typeof dialog.showModal === 'function') {
        dialog.showModal();
      }
    } else if (dialog.open && typeof dialog.close === 'function') {
      dialog.close();
    }
  }, [open]);

  // Fallback for browsers without native `closedby="any"` support
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleNativeClose = () => {
      onClose();
    };
    dialog.addEventListener('close', handleNativeClose);

    let handleBackdropClick: ((event: MouseEvent) => void) | null = null;
    if (typeof HTMLDialogElement !== 'undefined' && !('closedBy' in HTMLDialogElement.prototype)) {
      handleBackdropClick = (event: MouseEvent) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;

        if (isDialogContent) return;
        dialog.close();
      };
      dialog.addEventListener('click', handleBackdropClick);
    }

    return () => {
      dialog.removeEventListener('close', handleNativeClose);
      if (handleBackdropClick) {
        dialog.removeEventListener('click', handleBackdropClick);
      }
    };
  }, [onClose]);

  if (!open) return null;

  const maxWidthClass = MAX_WIDTH_MAP[maxWidth] || 'max-w-md';

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby={titleId}
      className={`m-auto w-full ${maxWidthClass} rounded-2xl bg-stone-900 border border-stone-800 text-stone-100 p-0 shadow-2xl open:animate-in open:fade-in open:zoom-in-95 duration-150`}
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 id={titleId} className="text-base font-bold text-white">
              {title}
            </h3>
            {subtitle && <p className="text-xs text-stone-400 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={() => {
              dialogRef.current?.close();
              onClose();
            }}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
