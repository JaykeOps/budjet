import type { ReactNode } from "react";
import { Hint as HintBubble } from "../../ui/Hint";
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
    <HintBubble
      term={term}
      classNames={{
        button: styles.hintButton,
        bubble: styles.hintBubble,
        text: styles.hintText,
      }}
    >
      {children}
    </HintBubble>
  );
}

export const availableHint =
  "What a Category has left to spend this Month. Whatever's left carries into next Month.";
