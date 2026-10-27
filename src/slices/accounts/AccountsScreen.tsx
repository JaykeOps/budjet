import { useId, useState } from "react";
import { type Currency, formatMoney, type Money } from "../../kernel/money";
import { useChangeLogQuery } from "../../kernel/use-change-log-query";
import { RedeclareBalanceForm, RenameAccountForm } from "./ChangeAccountForms";
import { OpenAccountForm, type OpenAccountInput } from "./OpenAccountForm";
import { accounts, accountsTotal } from "./queries";

const KIND_LABELS = { checking: "Checking", savings: "Savings", cash: "Cash" };

/**
 * Every Account with its balance, the total across them, and ways to add,
 * re-declare, rename and close them. The app shell decides what each does;
 * an error it throws is shown here.
 */
export function AccountsScreen({
  currency,
  onOpenAccount,
  onRedeclareBalance,
  onRename,
  onClose,
}: {
  currency: Currency;
  onOpenAccount: (input: OpenAccountInput) => void;
  onRedeclareBalance: (accountId: string, balance: Money) => void;
  onRename: (accountId: string, name: string) => void;
  onClose: (accountId: string) => void;
}) {
  const headingId = useId();
  const all = useChangeLogQuery(accounts);
  const open = all.filter(({ closed }) => !closed);
  const total = useChangeLogQuery(accountsTotal);
  const [error, setError] = useState<string>();

  function close(accountId: string) {
    try {
      onClose(accountId);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      return;
    }
    setError(undefined);
  }

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>Accounts</h2>
      <table aria-labelledby={headingId}>
        <thead>
          <tr>
            <th scope="col">Account</th>
            <th scope="col">Type</th>
            <th scope="col">Balance</th>
            <th scope="col" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {all.map((account) => (
            <tr key={account.id}>
              <th scope="row">
                {account.name}
                {account.closed && " (closed)"}
              </th>
              <td>{KIND_LABELS[account.kind]}</td>
              <td>{formatMoney(account.balance)}</td>
              <td>
                {!account.closed && (
                  <button
                    type="button"
                    aria-label={`Close ${account.name}`}
                    onClick={() => close(account.id)}
                  >
                    Close
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        {total && (
          <tfoot>
            <tr>
              <th scope="row" colSpan={2}>
                Total
              </th>
              <td>{formatMoney(total)}</td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
      {error && <p role="alert">{error}</p>}
      <OpenAccountForm
        heading="Add an Account"
        currency={currency}
        onOpen={onOpenAccount}
      />
      <RedeclareBalanceForm
        accounts={open}
        currency={currency}
        onRedeclare={onRedeclareBalance}
      />
      <RenameAccountForm accounts={all} onRename={onRename} />
    </section>
  );
}
