/** Whether this browser can keep a Budget in a Data Folder. Only ever ask this, never which browser it is. */
export function hasFolderPicker(): boolean {
  return "showDirectoryPicker" in window;
}

/** On an iPhone, a site added to the Home Screen has the best chance of keeping its storage. */
export function shouldSuggestHomeScreen(): boolean {
  return (
    /iPhone|iPod/.test(navigator.userAgent) &&
    !window.matchMedia("(display-mode: standalone)").matches
  );
}
