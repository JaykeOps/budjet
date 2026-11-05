import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import styles from "./Toast.module.css";

export type Toast = {
  text: string;
  /** Without one the toast only says what happened. */
  onUndo?: () => void;
};

const SHOWN_FOR_MS = 6000;

const ShowToast = createContext<(toast: Toast) => void>(() => {});

/** Shows a toast, replacing any still showing: Undo applies to the latest only. */
export function useToast(): (toast: Toast) => void {
  return useContext(ShowToast);
}

/**
 * Holds the one toast there can be, announced to assistive technology. It stays
 * while the pointer or focus is on it, so nobody loses Undo while reaching for it.
 */
export function Toasts({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast>();
  const [held, setHeld] = useState(false);
  const focusBefore = useRef<Element | null>(null);

  const show = useCallback((next: Toast) => {
    focusBefore.current = document.activeElement;
    setHeld(false);
    setToast(next);
  }, []);

  useEffect(() => {
    if (!toast || held) return;
    const timer = setTimeout(() => setToast(undefined), SHOWN_FOR_MS);
    return () => clearTimeout(timer);
  }, [toast, held]);

  function undo() {
    toast?.onUndo?.();
    setToast(undefined);
    if (focusBefore.current instanceof HTMLElement) focusBefore.current.focus();
  }

  return (
    <ShowToast.Provider value={show}>
      {children}
      {/* Always in the page, because a live region has to exist before it changes. */}
      <div
        role="status"
        aria-label="Notification"
        className={styles.region}
        onMouseEnter={() => setHeld(true)}
        onMouseLeave={() => setHeld(false)}
        onFocus={() => setHeld(true)}
        onBlur={() => setHeld(false)}
      >
        {toast && (
          <div className={styles.toast}>
            <span>{toast.text}</span>
            {toast.onUndo && (
              <button type="button" className={styles.undo} onClick={undo}>
                Undo
              </button>
            )}
          </div>
        )}
      </div>
    </ShowToast.Provider>
  );
}
