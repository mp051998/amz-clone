'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export interface ToastApi {
  /** Show a short message in the bottom-centred dark pill for 2.6s (replaces any current toast). */
  toast: (text: string) => void;
  /** Raise the toast above the compare tray while the tray is visible (CompareTray calls this). */
  setLifted: (lifted: boolean) => void;
}

const noop: ToastApi = { toast: () => {}, setLifted: () => {} };
const ToastContext = createContext<ToastApi>(noop);

/** Toast API; a no-op outside ToastProvider so isolated renders (tests) never crash. */
export function useToast(): ToastApi {
  return useContext(ToastContext);
}

export const TOAST_MS = 2600;

/** Global toast host (design.md §5 Toast). Mounted once in AppShell. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState<string | null>(null);
  const [lifted, setLifted] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((t: string) => {
    if (timer.current) clearTimeout(timer.current);
    setText(t);
    timer.current = setTimeout(() => setText(null), TOAST_MS);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const api = useMemo(() => ({ toast, setLifted }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* live region always mounted so screen readers announce each new message */}
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-none fixed left-1/2 z-[70] w-max max-w-[calc(100%-32px)] -translate-x-1/2 transition-[bottom] duration-150 ${
          lifted ? 'bottom-[150px] md:bottom-[96px]' : 'bottom-6'
        }`}
      >
        {text ? <div className="rounded-input bg-ink px-4 py-[11px] text-[14px] text-white shadow-toast">{text}</div> : null}
      </div>
    </ToastContext.Provider>
  );
}
