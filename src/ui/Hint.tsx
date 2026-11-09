import type { ReactNode } from "react";
import { Button, Dialog, DialogTrigger, Popover } from "react-aria-components";

/** A `?` beside a word, which explains it in a bubble. The caller styles both. */
export function Hint({
  term,
  classNames,
  children,
}: {
  term: string;
  classNames: { button: string; bubble: string; text: string };
  children: ReactNode;
}) {
  return (
    <DialogTrigger>
      <Button className={classNames.button} aria-label={`What is ${term}?`}>
        ?
      </Button>
      <Popover className={classNames.bubble}>
        <Dialog className={classNames.text} aria-label={term}>
          {children}
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
