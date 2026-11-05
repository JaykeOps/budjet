import {
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Currency } from "./kernel/money";
import { placeAddress, usePlace } from "./place-in-url";
import { useAccounts } from "./slices/accounts";
import { RecordRow } from "./slices/transactions";
import type { TransferDraft } from "./slices/transfers";
import { railShows } from "./ui/rail";
import { pushAddress, useUrlParameter } from "./url-parameter";
import { useRecordCommands } from "./use-record-commands";

type Recording = {
  /** A new one starts afresh, instead of keeping what's typed. */
  key: number;
  focusRequest: number;
  /** Where the row belongs: leaving closes it. */
  spot: string;
  accountId?: string;
  transfer?: TransferDraft;
  fromBudget: boolean;
};

/** Whether the rail shows, at the width the CSS switches it. */
export const isDesktop = railShows;

/**
 * The row that records on desktop: Record and Alt+N start it, above the history
 * of the Account showing if that's open, or else All Accounts. Returns the row
 * for the screen with the history to put above its history.
 */
export function useRecordingRow(currency: Currency): {
  row: ReactNode;
  start: (transfer?: TransferDraft) => void;
  recordButton: RefObject<HTMLButtonElement | null>;
} {
  const accounts = useAccounts();
  const place = usePlace();
  const [accountId] = useUrlParameter("account");
  const commands = useRecordCommands();
  const recordButton = useRef<HTMLButtonElement>(null);
  const [recording, setRecording] = useState<Recording>();
  const spot = place === "accounts" ? `accounts/${accountId}` : place;
  const nextKey = useRef(0);

  // Leaving the place the row is in closes it.
  if (recording && recording.spot !== spot) setRecording(undefined);

  function start(transfer?: TransferDraft) {
    const here = accounts.find(({ id, closed }) => id === accountId && !closed);
    const hasHistoryHere =
      (place === "accounts" && here) ||
      (place === "activity" && (here || !accountId));
    if (!hasHistoryHere) {
      pushAddress(placeAddress("activity"));
      window.scrollTo(0, 0);
    }
    setRecording((current) => {
      if (current && !transfer) {
        return { ...current, focusRequest: current.focusRequest + 1 };
      }
      nextKey.current += 1;
      return {
        key: nextKey.current,
        focusRequest: 0,
        spot: hasHistoryHere ? spot : "activity",
        accountId: here?.id,
        transfer,
        fromBudget: place === "budget",
      };
    });
  }

  const startRef = useRef(start);
  startRef.current = start;
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!event.altKey || event.code !== "KeyN" || !isDesktop()) return;
      if (document.querySelector("[role='dialog']")) return;
      event.preventDefault();
      startRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function close() {
    setRecording(undefined);
    recordButton.current?.focus();
  }

  const showing = recording?.spot === spot ? recording : undefined;
  return {
    start,
    recordButton,
    row: showing && (
      <RecordRow
        key={showing.key}
        currency={currency}
        defaultAccountId={showing.accountId}
        transfer={showing.transfer}
        focusRequest={showing.focusRequest}
        onBack={
          showing.fromBudget
            ? () => {
                pushAddress(placeAddress("budget"));
                window.scrollTo(0, 0);
                recordButton.current?.focus();
              }
            : undefined
        }
        onRecord={commands.record}
        onTransfer={commands.transfer}
        onClose={close}
      />
    ),
  };
}
