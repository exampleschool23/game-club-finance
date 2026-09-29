'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle, X, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export type ToastType = 'success' | 'error';

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
  durationMs?: number;
}

/** Transient bottom-right notification; auto-dismisses. */
export function Toast({ message, type, onClose, durationMs = 3500 }: ToastProps) {
  const tc = useTranslations('common');

  useEffect(() => {
    const timer = setTimeout(onClose, durationMs);
    return () => clearTimeout(timer);
  }, [durationMs, onClose]);

  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      className={cn(
        'fixed bottom-4 left-4 right-4 z-[80] flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg sm:left-auto sm:max-w-sm',
        type === 'success' ? 'bg-success-600' : 'bg-danger-600',
      )}
    >
      {type === 'success' ? <CheckCircle size={18} aria-hidden="true" /> : <XCircle size={18} aria-hidden="true" />}
      <span className="flex-1">{message}</span>
      <button type="button" onClick={onClose} aria-label={tc('close')} className="rounded-md p-1 opacity-80 hover:opacity-100">
        <X size={16} />
      </button>
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = useState<{ message: string; type: ToastType; key: number } | null>(null);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    setToast({ message, type, key: Date.now() });
  }, []);

  const hideToast = useCallback(() => setToast(null), []);

  /** Render once near the end of the page tree. */
  const toastElement = toast ? (
    <Toast key={toast.key} message={toast.message} type={toast.type} onClose={hideToast} />
  ) : null;

  return { toast, showToast, hideToast, toastElement };
}
