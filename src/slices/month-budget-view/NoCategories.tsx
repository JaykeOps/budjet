import { type FormEvent, useState } from "react";
import { EmptyState } from "../../ui/EmptyState";
import { OpenableSheet } from "../../ui/Sheet";
import styles from "./MonthBudget.module.css";

/** What the app shell does for the empty Budget. Either may refuse by throwing. */
export type FirstCategoryChanges = {
  addCategory: (input: { name: string; groupName: string }) => void;
  addStarterSet: () => void;
};

/**
 * The Budget with no Categories. The starter set is only for a Budget with no
 * Category Groups either: `addStarterSet` refuses any other.
 */
export function NoCategories({
  offerStarterSet,
  changes,
  onAdded,
  onError,
}: {
  offerStarterSet: boolean;
  changes: FirstCategoryChanges;
  /** The first Category is in, so the rest of the Categories can follow. */
  onAdded: () => void;
  onError: (message: string) => void;
}) {
  const [adding, setAdding] = useState(false);

  function addStarterSet() {
    try {
      changes.addStarterSet();
    } catch (failure) {
      onError(failure instanceof Error ? failure.message : String(failure));
    }
  }

  return (
    <>
      <EmptyState
        actions={
          <>
            <button type="button" data-primary onClick={() => setAdding(true)}>
              Add a Category
            </button>
            {offerStarterSet && (
              <button type="button" onClick={addStarterSet}>
                Use the starter set
              </button>
            )}
          </>
        }
      >
        No Categories yet. A Category is a job for your money, like Rent or
        Groceries.
      </EmptyState>
      <OpenableSheet
        title="Add a Category"
        isOpen={adding}
        onClose={() => setAdding(false)}
      >
        {() => (
          <AddCategoryForm
            onAdd={(input) => {
              changes.addCategory(input);
              setAdding(false);
              onAdded();
            }}
          />
        )}
      </OpenableSheet>
    </>
  );
}

function AddCategoryForm({
  onAdd,
}: {
  onAdd: (input: { name: string; groupName: string }) => void;
}) {
  const [name, setName] = useState("");
  const [groupName, setGroupName] = useState("");
  const [error, setError] = useState<string>();

  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      onAdd({ name, groupName });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }

  return (
    <form className={styles.addCategory} onSubmit={submit}>
      <label className={styles.addCategoryField}>
        Name
        <input
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className={styles.addCategoryField}>
        New Category Group
        <input
          required
          value={groupName}
          onChange={(event) => setGroupName(event.target.value)}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" data-primary>
        Add Category
      </button>
    </form>
  );
}
