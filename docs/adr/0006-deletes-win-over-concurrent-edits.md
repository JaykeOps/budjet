# Deletes win over concurrent edits

ADR 0004 merges two devices' edits to the same thing by letting the most recent edit win. Deletion is the exception: once any device deletes a thing (a Transaction, a Transfer, a Category, a Category Group), every other record about it is ignored, whatever its timestamp, so the thing stays deleted. Without this, a phone that edited a Transaction offline, after a laptop deleted it, would bring it back on the next sync merge with a later timestamp, silently changing Account balances, Available and Ready to Assign. A delete is a deliberate "this should not exist", while an edit from another device usually just means that device had not seen the delete yet. The cost is that a delete can't be undone by editing the thing elsewhere; an undo, if budjet ever has one, will be its own record type.

## Consequences

- Every slice that deletes reads its records the same way: a subject with a delete record is gone, and edits before or after it don't count. The kernel provides this beside `latestBySubject`, so the folds share one rule.
- Most recent edit wins (ADR 0004) still settles everything else: two edits, renames and reorders.
