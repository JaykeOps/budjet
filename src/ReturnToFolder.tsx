import { useState } from "react";
import { chooseFolder } from "./first-run/browser";
import { Title } from "./first-run/FirstRun";
import styles from "./first-run/FirstRun.module.css";
import { useInstallOffered } from "./install-offer";
import {
  askToOpen,
  type OnReturn,
  type ReturningFolder,
} from "./kernel/folder-on-return";

/** Shown instead of the app until the user is back in their Data Folder. There's no read-only view. */
export function ReturnToFolder({
  folder,
  firstShown,
  onOpen,
  onChoose,
}: {
  folder: ReturningFolder;
  firstShown: Exclude<OnReturn, "open">;
  /** Shows the Budget from the Local Copy, in the folder it's remembered in. */
  onOpen: () => void;
  /** Keeps the Budget in the folder chosen in place of the lost one, and shows it. */
  onChoose: (chosen: FileSystemDirectoryHandle) => Promise<void>;
}) {
  const [shown, setShown] = useState(firstShown);

  async function open() {
    const onReturn = await askToOpen(folder);
    if (onReturn === "open") onOpen();
    else setShown(onReturn);
  }

  return (
    <main className={styles.page}>
      <p className={styles.brand}>Crownkeep</p>
      {shown === "lapsed" ? (
        <AccessLapsed folderName={folder.name} onOpen={open} />
      ) : (
        <FolderLost folderName={folder.name} onChoose={onChoose} />
      )}
    </main>
  );
}

function AccessLapsed({
  folderName,
  onOpen,
}: {
  folderName: string;
  onOpen: () => void;
}) {
  const installOffered = useInstallOffered();
  return (
    <>
      <Title>Open your Budget</Title>
      <p className={styles.lead}>It's in your folder, {folderName}.</p>
      {installOffered && (
        <p className={styles.note}>Install Crownkeep to skip this step.</p>
      )}
      <button type="button" className={styles.primary} onClick={onOpen}>
        Open
      </button>
    </>
  );
}

function FolderLost({
  folderName,
  onChoose,
}: {
  folderName: string;
  onChoose: (chosen: FileSystemDirectoryHandle) => Promise<void>;
}) {
  return (
    <>
      <Title>We can't find your folder, {folderName}.</Title>
      <p className={styles.lead}>
        If you moved it, choose it in its new place.
      </p>
      <button
        type="button"
        className={styles.primary}
        onClick={() => chooseFolder(onChoose)}
      >
        Choose a folder
      </button>
    </>
  );
}
