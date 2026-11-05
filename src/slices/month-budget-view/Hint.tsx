import type { ReactNode } from "react";
import { Button, Dialog, DialogTrigger, Popover } from "react-aria-components";
import styles from "./MonthBudget.module.css";

/** A `?` beside a word, which explains it in place. */
export function Hint({
  term,
  children,
}: {
  term: string;
  children: ReactNode;
}) {
  return (
    <DialogTrigger>
      <Button className={styles.hintButton} aria-label={`What is ${term}?`}>
        ?
      </Button>
      <Popover className={styles.hintBubble}>
        <Dialog className={styles.hintText} aria-label={term}>
          {children}
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}

export const availableHint =
  "What a Category has left to spend this Month. Whatever's left carries into next Month.";
