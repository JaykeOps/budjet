/**
 * What a returning user sees depends on trying their Data Folder, because
 * permission can't tell a lost folder: the browser still says `granted` with
 * the folder gone.
 */

import type { UnsavedReason } from "./change-log";

/** A remembered Data Folder, as far as coming back to it goes. Failures reject with the browser's `DOMException`s. */
export type ReturningFolder = {
  readonly name: string;
  /** Tries the folder itself. */
  reach(): Promise<void>;
  /** Asks the user for access again, which needs a tap. Says whether it was given. */
  askForAccess(): Promise<boolean>;
};

export type OnReturn = "open" | "lapsed" | "lost";

/** Long enough for a folder that's gone to say so, short enough not to feel like waiting. */
const REACH_TIME_BOX = 1000;

/**
 * The same folder, except that `reach` stops waiting for an answer once the time
 * is up, so the Budget opens from the Local Copy. Trying the folder carries on
 * behind it, and a failure found later goes to `onLateFailure`.
 */
export function timeBoxed(
  folder: ReturningFolder,
  onLateFailure: (reason: UnsavedReason) => void,
  timeIsUp: () => Promise<void> = () =>
    new Promise((resolve) => setTimeout(resolve, REACH_TIME_BOX)),
): ReturningFolder {
  return {
    ...folder,
    async reach() {
      let late = false;
      const reaching = folder.reach();
      reaching.catch((error) => {
        if (!late) return;
        const name = error instanceof DOMException ? error.name : undefined;
        if (name === "NotAllowedError") onLateFailure("access-lapsed");
        else if (name === "NotFoundError") onLateFailure("folder-gone");
        else console.error("Crownkeep could not try the folder", error);
      });
      await Promise.race([
        reaching,
        timeIsUp().then(() => {
          late = true;
        }),
      ]);
    },
  };
}

export async function tryFolderOnReturn(
  folder: ReturningFolder,
): Promise<OnReturn> {
  try {
    await folder.reach();
    return "open";
  } catch (error) {
    const name = error instanceof DOMException ? error.name : undefined;
    if (name === "NotAllowedError") return "lapsed";
    if (name === "NotFoundError") return "lost";
    // Nothing the user could do here, and the Budget opens from the Local Copy.
    // If writing fails too, the save state says so.
    console.error("Crownkeep could not try the folder", error);
    return "open";
  }
}

export async function askToOpen(folder: ReturningFolder): Promise<OnReturn> {
  try {
    if (!(await folder.askForAccess())) return "lapsed";
  } catch (error) {
    console.error("Crownkeep could not ask for the folder", error);
    return "lapsed";
  }
  return tryFolderOnReturn(folder);
}

/**
 * Gets a Budget that's open back to its folder, which needs a tap. A folder that
 * turns out to be gone as well shows in the save state when the retry fails, so
 * the next tap offers the picker: the browser may not allow two prompts in one.
 */
export async function reconnect(
  reason: UnsavedReason,
  {
    folder,
    retry,
    chooseFolder,
  }: {
    folder: ReturningFolder;
    /** Writes what's held to the same folder. */
    retry: () => void;
    chooseFolder: () => Promise<void>;
  },
): Promise<void> {
  if (reason === "folder-gone") return chooseFolder();
  if ((await askToOpen(folder)) !== "lapsed") retry();
}
