# budjet

A local-first budgeting app that runs in the browser and keeps the user's data on their own device.

## Language

**Data Folder**:
The directory on the user's device, chosen by the user, where budjet keeps their data. Getting it onto other devices is the job of whatever sync service the user points at that folder; budjet never talks to a sync service itself.
_Avoid_: Vault, workspace, sync folder, cloud storage

## Budgeting

**Budget**:
The user's whole plan for their money, in a single currency chosen when it is created. A Data Folder holds exactly one Budget.
_Avoid_: Plan, book, ledger

**Account**:
A place where the user holds money they could spend or move soon: a checking account, a savings account or cash. Every dollar in an Account is budgeted. Investments, property and debts are not Accounts, and budjet does not track them.
_Avoid_: Wallet, asset, bank

**Category**:
A job the user gives money to, such as Rent, Groceries or Emergency Fund. Budgeted money lives only in Categories.
_Avoid_: Envelope, bucket, line item

**Category Group**:
A named set of Categories for ordering and subtotalling them. A Category Group holds no money of its own.
_Avoid_: Section, folder, master category

**Month**:
A calendar month of the Budget, the period that Assignments belong to.
_Avoid_: Period, cycle

**Assignment**:
The amount the user gives to one Category in one Month.
_Avoid_: Allocation, budgeted amount, envelope fill

**Available**:
The money a Category has to spend in a Month: what it carried forward from the previous Month, plus that Month's Assignment, minus that Month's Spending in it. Available always carries forward to the next Month, whether positive or negative.
_Avoid_: Balance (that word belongs to Accounts), remaining

**Spending**:
What a Category's Transactions took out of the Budget in one Month: money going out, less refunds coming back in. A Month whose refunds outweigh its money going out has negative Spending. Transfers and Adjustments are never Spending.
_Avoid_: Expenses, activity, outflow

**Overspent**:
A Category whose Available is below zero. It stays Overspent, Month after Month, until the user raises its Assignment to cover it.
_Avoid_: In the red, deficit

**Ready to Assign**:
The money in the Budget that has not been given a job yet: everything that came in without a Category, minus every Assignment in every Month. It is one number for the whole Budget and can go below zero.
_Avoid_: To be budgeted, unassigned, free money

**Transaction**:
A single movement of money into or out of an Account on a date, entered by the user. Money going out always has a Category; money coming in has a Category (such as a refund) or goes to Ready to Assign.
_Avoid_: Entry, payment, expense

**Payee**:
Who the money in a Transaction went to or came from, as the user writes it.
_Avoid_: Merchant, vendor, counterparty

**Opening Balance**:
The amount the user declares an Account holds when they add it to the Budget. It counts as money coming in to Ready to Assign.
_Avoid_: Starting balance, initial amount

**Transfer**:
A movement of money from one Account to another. It has no Category, does not count as spending, and leaves Ready to Assign unchanged.
_Avoid_: Move, transaction pair

**Adjustment**:
The difference budjet records when the user re-declares an Account's real balance. It goes into, or comes out of, Ready to Assign.
_Avoid_: Correction, reconciliation, fix

## Delivery

**Release**:
A version of budjet identified by a git tag, with its release notes and its deployed build.
_Avoid_: Deploy (a deploy is one step of a release), version bump
