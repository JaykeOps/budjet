import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkSliceBoundaries } from "./check-slice-boundaries";

const fixture = (name: string) =>
  fileURLToPath(new URL(`./slice-boundary-fixtures/${name}`, import.meta.url));

describe("checkSliceBoundaries", () => {
  it("passes budjet's own source", () => {
    expect(
      checkSliceBoundaries(fileURLToPath(new URL("../src", import.meta.url))),
    ).toEqual([]);
  });

  it("allows a slice to read another slice's published records and public queries", () => {
    expect(checkSliceBoundaries(fixture("public-imports"))).toEqual([]);
  });

  it("rejects a slice importing another slice's non-public code", () => {
    expect(checkSliceBoundaries(fixture("non-public-import"))).toEqual([
      'slice "transactions" imports non-public code of slice "accounts": slices/transactions/index.ts imports "../accounts/helpers"',
    ]);
  });

  it("rejects a slice importing another slice's command", () => {
    expect(checkSliceBoundaries(fixture("command-import"))).toEqual([
      'slice "transfers" imports a command of slice "accounts": slices/transfers/index.ts imports "../accounts/commands"',
    ]);
  });

  it("allows the app shell to import any slice's commands", () => {
    expect(checkSliceBoundaries(fixture("shell-commands"))).toEqual([]);
  });

  it("rejects query dependencies between slices that form a cycle", () => {
    expect(checkSliceBoundaries(fixture("query-cycle"))).toEqual([
      "query dependencies between slices form a cycle: accounts → categories → transactions → accounts",
    ]);
  });
});
