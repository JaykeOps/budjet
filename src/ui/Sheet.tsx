import type { ReactNode, Ref } from "react";
import {
  Button,
  Dialog,
  DialogTrigger,
  Heading,
  Modal,
  ModalOverlay,
} from "react-aria-components";
import styles from "./Sheet.module.css";

/**
 * A button that opens a sheet rising from the bottom of a phone, or a dialog in
 * the middle of a desktop. Escape or tapping outside closes it, and focus goes
 * back to the button. What's inside starts afresh each time it opens.
 */
export function Sheet({
  title,
  trigger,
  triggerClassName,
  children,
}: {
  title: string;
  trigger: ReactNode;
  triggerClassName?: string;
  children: (close: () => void) => ReactNode;
}) {
  return (
    <DialogTrigger>
      <Button className={triggerClassName}>{trigger}</Button>
      <Surface title={title}>{children}</Surface>
    </DialogTrigger>
  );
}

/** The same sheet, for when something other than its own button opens it. */
export function OpenableSheet({
  title,
  isOpen,
  onClose,
  children,
}: {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: (close: () => void) => ReactNode;
}) {
  return (
    <Surface
      title={title}
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {children}
    </Surface>
  );
}

function Surface({
  title,
  isOpen,
  onOpenChange,
  children,
}: {
  title: string;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: (close: () => void) => ReactNode;
}) {
  return (
    <ModalOverlay
      isDismissable
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      className={styles.overlay}
    >
      <Modal className={styles.sheet}>
        <Dialog className={styles.dialog}>
          {({ close }) => (
            <>
              <Heading slot="title" className={styles.title}>
                {title}
              </Heading>
              {children(close)}
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

/**
 * A sheet whose inside a slice lays out itself, with its own styles: steps, a
 * back link, a title of its own. It's open while it's rendered, and Escape or
 * tapping outside calls `onClose`. Put a `SheetTitle` inside, and a `SheetClose`
 * if it shows one.
 */
export function SheetShell({
  onClose,
  classNames,
  dialogRef,
  children,
}: {
  onClose: () => void;
  classNames: { overlay: string; sheet: string; dialog: string };
  dialogRef?: Ref<HTMLElement>;
  children: ReactNode;
}) {
  return (
    <ModalOverlay
      isOpen
      isDismissable
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      className={classNames.overlay}
    >
      <Modal className={classNames.sheet}>
        <Dialog ref={dialogRef} className={classNames.dialog}>
          {children}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

/** The heading a `SheetShell` is named by. */
export function SheetTitle({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <Heading slot="title" className={className}>
      {children}
    </Heading>
  );
}

/** Closes the `SheetShell` it's in. */
export function SheetClose({ className }: { className?: string }) {
  return (
    <Button className={className} slot="close">
      Close
    </Button>
  );
}
