import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findFeatureSliceViolations } from "./check";

const example = (name: string) =>
  fileURLToPath(new URL(`./examples/${name}`, import.meta.url));

describe("the feature slice architecture check", () => {
  it("passes budjet's own source", () => {
    expect(
      findFeatureSliceViolations(
        fileURLToPath(new URL("../../src", import.meta.url)),
      ),
    ).toEqual([]);
  });

  it("allows a slice to read another slice's published records and public queries", () => {
    expect(findFeatureSliceViolations(example("public-imports"))).toEqual([]);
  });

  it("rejects a slice importing another slice's non-public code", () => {
    expect(findFeatureSliceViolations(example("non-public-import"))).toEqual([
      'slice "transactions" imports non-public code of slice "accounts": slices/transactions/index.ts imports "../accounts/helpers"',
    ]);
  });

  it("rejects a slice importing another slice's command", () => {
    expect(findFeatureSliceViolations(example("command-import"))).toEqual([
      'slice "transfers" imports a command of slice "accounts": slices/transfers/index.ts imports "../accounts/commands"',
    ]);
  });

  it("rejects a slice's records importing another slice, so records stay leaves", () => {
    expect(findFeatureSliceViolations(example("records-import"))).toEqual([
      'records of slice "transactions" may import only the kernel: slices/transactions/records.ts imports "../accounts"',
    ]);
  });

  it("allows the app shell to import any slice's commands", () => {
    expect(findFeatureSliceViolations(example("shell-commands"))).toEqual([]);
  });

  it("rejects query dependencies between slices that form a cycle", () => {
    expect(findFeatureSliceViolations(example("query-cycle"))).toEqual([
      "query dependencies between slices form a cycle: accounts → categories → transactions → accounts",
    ]);
  });
});
