/** Whether this browser can keep a Budget in a Data Folder. Only ever ask this, never which browser it is. */
export function hasFolderPicker(): boolean {
  return "showDirectoryPicker" in window;
}

/** Opens the folder picker, handing what's chosen to `onChoose`. Cancelling does nothing. */
export async function chooseFolder(
  onChoose: (folder: FileSystemDirectoryHandle) => Promise<void>,
): Promise<void> {
  try {
    const folder = await window.showDirectoryPicker?.({
      id: "crownkeep",
      mode: "readwrite",
    });
    if (folder) await onChoose(folder);
  } catch (error) {
    // Cancelling, and declining the browser's prompt, both arrive as AbortError.
    if (!(error instanceof DOMException && error.name === "AbortError")) {
      console.error("Crownkeep could not use that folder", error);
    }
  }
}

/** On an iPhone, a site added to the Home Screen has the best chance of keeping its storage. */
export function shouldSuggestHomeScreen(): boolean {
  return (
    /iPhone|iPod/.test(navigator.userAgent) &&
    !window.matchMedia("(display-mode: standalone)").matches
  );
}
