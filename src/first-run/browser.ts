import { pickFolder } from "../kernel/browser-folder";

/**
 * Whether this browser can keep a Budget in a Data Folder. Ask this, not which
 * browser it is: the one exception is `shouldSuggestHomeScreen`.
 */
export function hasFolderPicker(): boolean {
  return "showDirectoryPicker" in window;
}

/** Opens the folder picker, handing what's chosen to `onChoose`. Cancelling does nothing. */
export async function chooseFolder(
  onChoose: (folder: FileSystemDirectoryHandle) => Promise<void>,
): Promise<void> {
  try {
    const folder = await pickFolder();
    if (folder) await onChoose(folder);
  } catch (error) {
    console.error("Crownkeep could not use that folder", error);
  }
}

/**
 * On an iPhone, a site added to the Home Screen has the best chance of keeping
 * its storage. No feature tells that apart, so this alone reads the user agent,
 * and only for the hint.
 */
export function shouldSuggestHomeScreen(): boolean {
  return (
    /iPhone|iPod/.test(navigator.userAgent) &&
    !window.matchMedia("(display-mode: standalone)").matches
  );
}
