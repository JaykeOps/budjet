/**
 * What a returning user sees depends on trying their Data Folder, because
 * permission can't tell a lost folder: the browser still says `granted` with
 * the folder gone.
 */

/** A remembered Data Folder, as far as coming back to it goes. Failures reject with the browser's `DOMException`s. */
export type ReturningFolder = {
  readonly name: string;
  /** Tries the folder itself. */
  reach(): Promise<void>;
  /** Asks the user for access again, which needs a tap. Says whether it was given. */
  askForAccess(): Promise<boolean>;
};

export type OnReturn = "open" | "lapsed" | "lost";

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
