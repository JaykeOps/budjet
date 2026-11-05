import type { ReactNode } from "react";
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
      <ModalOverlay isDismissable className={styles.overlay}>
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
    </DialogTrigger>
  );
}
