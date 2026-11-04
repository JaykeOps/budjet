import { readFileSync } from "node:fs";
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

  it("allows ui to import the kernel and ui, and slices and the app shell to import ui", () => {
    expect(findFeatureSliceViolations(example("shared-ui-imports"))).toEqual(
      [],
    );
  });

  it("rejects ui importing a slice or the app shell", () => {
    expect(findFeatureSliceViolations(example("ui-imports"))).toEqual([
      'ui may import only the kernel and ui: ui/AccountCount.ts imports "../slices/accounts"',
      'ui may import only the kernel and ui: ui/Title.ts imports "../App"',
    ]);
  });

  it("rejects the kernel importing ui, a slice or the app shell", () => {
    expect(findFeatureSliceViolations(example("kernel-imports"))).toEqual([
      'the kernel may import only the kernel: kernel/count.ts imports "../slices/accounts"',
      'the kernel may import only the kernel: kernel/label.ts imports "../ui/Card"',
      'the kernel may import only the kernel: kernel/name.ts imports "../App"',
    ]);
  });

  it("rejects records importing ui, the app shell or their own slice", () => {
    expect(
      findFeatureSliceViolations(example("records-outside-kernel")),
    ).toEqual([
      'records of slice "accounts" may import only the kernel: slices/accounts/records.ts imports "../../App"',
      'records of slice "accounts" may import only the kernel: slices/accounts/records.ts imports "../../ui/Card"',
      'records of slice "accounts" may import only the kernel: slices/accounts/records.ts imports "./helpers"',
    ]);
  });

  it("rejects non-relative imports that resolve into the source tree, and leaves packages alone", () => {
    expect(findFeatureSliceViolations(example("non-relative-imports"))).toEqual(
      [
        'imports inside the source tree must be relative: App.ts imports "kernel/money"',
        'imports inside the source tree must be relative: App.ts imports "src/ui/Card.js"',
        'imports inside the source tree must be relative: App.ts imports "@/ui/Card"',
        'imports inside the source tree must be relative: App.ts imports "~/slices/accounts/helpers"',
        'imports inside the source tree must be relative: App.ts imports "/src/kernel/money"',
      ],
    );
  });

  it("finds no path aliases in the TypeScript config", () => {
    const { compilerOptions } = JSON.parse(
      readFileSync(new URL("../../tsconfig.json", import.meta.url), "utf8"),
    );
    expect(compilerOptions).not.toHaveProperty("paths");
    expect(compilerOptions).not.toHaveProperty("baseUrl");
  });
});
