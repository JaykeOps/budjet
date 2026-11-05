/** The release tag (e.g. v0.1.0), stamped at build time (docs/adr/0003). */
declare const __APP_VERSION__: string;

/** The folder picker, which only some browsers have and TypeScript's DOM types leave out. */
interface Window {
  showDirectoryPicker?(options: {
    id: string;
    mode: "readwrite";
  }): Promise<FileSystemDirectoryHandle>;
}

/** The parts of File System Access that TypeScript's DOM types leave out. */
interface FileSystemHandle {
  queryPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
}

interface FileSystemDirectoryHandle {
  keys(): AsyncIterableIterator<string>;
}
