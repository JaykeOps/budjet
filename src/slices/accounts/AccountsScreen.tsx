import { useId } from "react";
import { type Currency, formatMoney } from "../../kernel/money";
import { useChangeLogQuery } from "../../kernel/use-change-log-query";
import { OpenAccountForm, type OpenAccountInput } from "./OpenAccountForm";
import { accounts, accountsTotal } from "./queries";

const KIND_LABELS = { checking: "Checking", savings: "Savings", cash: "Cash" };

/** Every Account with its balance, the total across them, and a form to add another. */
export function AccountsScreen({
  currency,
  onOpenAccount,
}: {
  currency: Currency;
  onOpenAccount: (input: OpenAccountInput) => void;
}) {
  const headingId = useId();
  const all = useChangeLogQuery(accounts);
  const total = useChangeLogQuery(accountsTotal);

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>Accounts</h2>
      <table aria-labelledby={headingId}>
        <thead>
          <tr>
            <th scope="col">Account</th>
            <th scope="col">Type</th>
            <th scope="col">Balance</th>
          </tr>
        </thead>
        <tbody>
          {all.map((account) => (
            <tr key={account.id}>
              <th scope="row">{account.name}</th>
              <td>{KIND_LABELS[account.kind]}</td>
              <td>{formatMoney(account.balance)}</td>
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
            </tr>
          </tfoot>
        )}
      </table>
      <OpenAccountForm
        heading="Add an Account"
        currency={currency}
        onOpen={onOpenAccount}
      />
    </section>
  );
}
