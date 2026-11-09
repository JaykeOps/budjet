import { useState } from "react";
import { pickFolder } from "../../kernel/browser-folder";
import type { MoveOutcome } from "../../kernel/data-folder-change-log";
import styles from "./MoveIntoFolderOffer.module.css";

const REFUSALS: Record<Exclude<MoveOutcome, "moved">, string> = {
  "holds-a-budget":
    "This folder already holds a Budget, so yours can't go there. Choose another folder.",
  failed:
    "Crownkeep couldn't put your Budget in that folder, so nothing has changed. Your Budget is still in this browser.",
};

/**
 * Offers a Budget in browser storage a move into a folder. Not now lasts until
 * the next open, so the offer returns each time.
 */
export function MoveIntoFolderOffer({
  isInFolder,
  moveIntoFolder,
}: {
  isInFolder: () => boolean;
  moveIntoFolder: (folder: FileSystemDirectoryHandle) => Promise<MoveOutcome>;
}) {
  const [showing, setShowing] = useState(() => !isInFolder());
  const [moving, setMoving] = useState(false);
  const [refusal, setRefusal] = useState<string>();
  const [movedTo, setMovedTo] = useState<string>();

  async function choose() {
    setRefusal(undefined);
    let folder: FileSystemDirectoryHandle | undefined;
    try {
      folder = await pickFolder();
    } catch (error) {
      console.error("Crownkeep could not use that folder", error);
      setRefusal(REFUSALS.failed);
      return;
    }
    if (!folder) return;
    setMoving(true);
    const outcome = await moveIntoFolder(folder);
    setMoving(false);
    if (outcome === "moved") setMovedTo(folder.name);
    else setRefusal(REFUSALS[outcome]);
  }

  if (!showing) return null;
  if (movedTo !== undefined) {
    return (
      <section aria-label="Your Budget's folder" className={styles.offer}>
        <p role="status" className={styles.text}>
          Your Budget is now in {movedTo}.
        </p>
        <div className={styles.actions}>
          <button type="button" onClick={() => setShowing(false)}>
            Done
          </button>
        </div>
      </section>
    );
  }
  return (
    <section aria-labelledby="move-into-folder" className={styles.offer}>
      <h2 id="move-into-folder" className={styles.title}>
        Move your Budget into a folder
      </h2>
      <p className={styles.text}>
        Crownkeep keeps everything in that folder, and nothing goes to us. Pick
        a folder a sync service already watches to reach other devices.
      </p>
      {refusal && (
        <p role="alert" className={styles.refusal}>
          {refusal}
        </p>
      )}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primary}
          disabled={moving}
          onClick={choose}
        >
          {moving ? "Moving your Budget…" : "Choose a folder"}
        </button>
        <button
          type="button"
          disabled={moving}
          onClick={() => setShowing(false)}
        >
          Not now
        </button>
      </div>
    </section>
  );
}
