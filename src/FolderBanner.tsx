import styles from "./FolderBanner.module.css";
import type { UnsavedReason } from "./kernel/change-log";
import { useSaveState } from "./kernel/use-change-log-query";

/** How the app gets back to the Data Folder a Budget is kept in. */
export type FolderConnection = {
  /** False for a Budget still in browser storage, which has no folder to save to. */
  isInFolder(): boolean;
  reconnect(reason: UnsavedReason): Promise<void>;
};

/**
 * Stays up while changes can't reach the folder, and the user keeps working:
 * they go to the Local Copy. The live region is always there, so a screen reader
 * announces the message when it arrives.
 */
export function FolderBanner({ connection }: { connection: FolderConnection }) {
  const saveState = useSaveState();
  const unsaved =
    saveState.status === "unsaved" && connection.isInFolder()
      ? saveState
      : undefined;
  return (
    <div className={unsaved ? styles.banner : styles.quiet}>
      <p role="status" className={styles.message}>
        {unsaved && "Not saved to your folder yet"}
      </p>
      {unsaved && (
        <button
          type="button"
          className={styles.reconnect}
          onClick={() => connection.reconnect(unsaved.reason)}
        >
          Reconnect
        </button>
      )}
    </div>
  );
}
