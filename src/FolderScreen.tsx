import { GettingYourBudget, Title } from "./first-run/FirstRun";
import styles from "./first-run/FirstRun.module.css";
import type { FolderScreen as Screen } from "./folder-chooser";

function Button({
  primary = false,
  onClick,
  children,
}: {
  primary?: boolean;
  onClick: () => Promise<void>;
  children: string;
}) {
  return (
    <button
      type="button"
      className={primary ? styles.primary : styles.secondary}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Shown in place of the app until the folder chosen is settled one way or another. */
export function FolderScreen({ screen }: { screen: Screen }) {
  if (screen.kind === "reading") {
    return <GettingYourBudget progress={screen.progress} />;
  }
  return (
    <main className={styles.page}>
      <p className={styles.brand}>Crownkeep</p>
      {/* Keyed so each new message takes focus and a screen reader follows along. */}
      <Message key={screen.kind} screen={screen} />
    </main>
  );
}

function Message({ screen }: { screen: Exclude<Screen, { kind: "reading" }> }) {
  switch (screen.kind) {
    case "no-budget":
      return (
        <>
          <Title>There's no Budget in {screen.name}.</Title>
          <Button primary onClick={screen.chooseAnother}>
            Choose another
          </Button>
          {screen.putHere && (
            <Button onClick={screen.putHere}>Put my Budget here</Button>
          )}
          <Button onClick={screen.startNew}>Start a new Budget</Button>
        </>
      );
    case "refused":
      return (
        <>
          <Title>
            This folder holds a different Budget, and you have changes that
            haven't been saved.
          </Title>
          <Button primary onClick={screen.chooseAnother}>
            Choose another
          </Button>
          <Button onClick={screen.discardAndOpen}>
            Discard my changes and open it
          </Button>
        </>
      );
    case "start-refused":
      return (
        <>
          <Title>
            Starting a new Budget leaves behind changes that haven't been saved.
          </Title>
          <Button primary onClick={screen.chooseAnother}>
            Choose another
          </Button>
          <Button onClick={screen.discardAndStart}>
            Discard my changes and start
          </Button>
        </>
      );
    case "two-budgets":
      return (
        <>
          <Title>A different Budget is in your folder, {screen.name}.</Title>
          <p className={styles.lead}>
            Crownkeep has stopped, and brought nothing in from it. Pick a clean
            folder to keep your Budget in.
          </p>
          <Button primary onClick={screen.chooseAnother}>
            Choose a folder
          </Button>
        </>
      );
    case "unreadable":
      return (
        <>
          <Title>We couldn't read {screen.name}.</Title>
          <p className={styles.lead}>Nothing has changed.</p>
          <Button primary onClick={screen.chooseAnother}>
            Choose another
          </Button>
        </>
      );
  }
}
