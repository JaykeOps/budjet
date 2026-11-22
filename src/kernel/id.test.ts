import { describe, expect, expectTypeOf, it } from "vitest";
import { asId, type Id, newId } from "./id";

type AccountId = Id<"Account">;
type CategoryId = Id<"Category">;

describe("ids", () => {
  it("are new each time, and plain strings at runtime", () => {
    const first = newId<AccountId>();
    const second = newId<AccountId>();

    expect(first).not.toBe(second);
    expect(typeof first).toBe("string");
    expect(asId<AccountId>(first)).toBe(first);
  });

  it("come only in the kinds a Budget has", () => {
    // @ts-expect-error a typo isn't a kind
    expectTypeOf<Id<"Acount">>().toExtend<string>();
  });

  it("keep their kinds apart, and still work as strings", () => {
    expectTypeOf<AccountId>().not.toEqualTypeOf<CategoryId>();
    expectTypeOf<AccountId>().toExtend<string>();

    // @ts-expect-error an Account's id is not a Category's
    const category: CategoryId = newId<AccountId>();
    // @ts-expect-error a plain string is not an id until it's trusted
    const account: AccountId = "a-123";
    expect([category, account]).toHaveLength(2);
  });
});
