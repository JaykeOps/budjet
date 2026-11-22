/**
 * Writes a Change Record with no check, for tests: setting up records the way
 * another slice or another device would have written them. Production code
 * writes through `ensure`, so every record it adds has been checked.
 */
import type { ChangeRecord, DeviceChangeLog } from "./change-log";

export function seedRecord<Type extends string, Payload>(
  log: DeviceChangeLog,
  subjectId: string,
  type: Type,
  payload: Payload,
): ChangeRecord<Type, Payload> {
  return log
    .write<Type, Payload>(subjectId, type)
    .ensure(() => undefined)
    .commit(() => payload);
}
