/**
 * Keeps feature slices decoupled and the kernel and shared ui beneath them, as
 * docs/adr/0005 and docs/adr/0007 require. Run on a source
 * directory (default `src`); exits non-zero and lists every violation.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_FILE = /\.tsx?$/;
const MODULE_EXTENSION = /\.[jt]sx?$/;
/** A slice's public entry point (`index`, also reached by importing the folder) and its published records. */
const PUBLIC_MODULES = new Set(["", "index", "records"]);
const IMPORT_SPECIFIER = /(?:\bfrom|\bimport\s*\(?)\s*["']([^"']+)["']/g;
/** How a non-relative specifier reaches the source tree: an alias sigil (`@/`, `~/`, `#`), the root (`/`), or `src/`. */
const ALIAS_PREFIX = /^(?:[@~#]\/?|\/)?(?:src\/)?/;
const QUERY = /\?.*$/;

type Import = { file: string; specifier: string };
type Zone =
  | { kind: "kernel" | "ui" | "shell" }
  | { kind: "slice"; name: string; module: string };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const violations = findFeatureSliceViolations(process.argv[2] ?? "src");
  if (violations.length > 0) {
    console.error(violations.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Feature slices hold to ADRs 0005 and 0007.");
  }
}

export function findFeatureSliceViolations(srcDir: string): string[] {
  const violations: string[] = [];
  const queryDependencies = new Map<string, Set<string>>();
  const modules = sourceModules(srcDir);
  for (const { file, specifier } of sourceImports(srcDir)) {
    const where = `${file} imports "${specifier}"`;
    if (!specifier.startsWith(".")) {
      if (modules.has(sourcePathOf(specifier))) {
        violations.push(
          `imports inside the source tree must be relative: ${where}`,
        );
      }
      continue;
    }
    const from = zoneOf(file);
    const to = zoneOf(join(dirname(file), specifier));
    const leaf = leafRule(from);
    if (leaf) {
      if (!leaf.mayImport.includes(to.kind)) {
        violations.push(`${leaf.rule}: ${where}`);
      }
      continue;
    }
    const fromSlice = from.kind === "slice" ? from.name : undefined;
    if (to.kind !== "slice" || fromSlice === to.name) continue;
    if (PUBLIC_MODULES.has(to.module)) {
      if (fromSlice && to.module !== "records") {
        const dependencies = queryDependencies.get(fromSlice) ?? new Set();
        queryDependencies.set(fromSlice, dependencies.add(to.name));
      }
      continue;
    }
    const importer = fromSlice ? `slice "${fromSlice}"` : "the app shell";
    if (!isCommand(to.module)) {
      violations.push(
        `${importer} imports non-public code of slice "${to.name}": ${where}`,
      );
    } else if (fromSlice) {
      violations.push(
        `${importer} imports a command of slice "${to.name}": ${where}`,
      );
    }
  }
  for (const cycle of cycles(queryDependencies)) {
    violations.push(
      `query dependencies between slices form a cycle: ${cycle.join(" → ")}`,
    );
  }
  return violations;
}

/** A cycle through each tangle of the graph, each starting and ending at the same node. */
function cycles(graph: Map<string, Set<string>>): string[][] {
  const found: string[][] = [];
  const done = new Set<string>();
  const path: string[] = [];
  const visit = (node: string) => {
    path.push(node);
    for (const next of [...(graph.get(node) ?? [])].sort()) {
      const start = path.indexOf(next);
      if (start !== -1) found.push([...path.slice(start), next]);
      else if (!done.has(next)) visit(next);
    }
    path.pop();
    done.add(node);
  };
  for (const node of [...graph.keys()].sort()) {
    if (!done.has(node)) visit(node);
  }
  return found;
}

/** Every import in the source tree, with its file relative to `srcDir`. */
function sourceImports(srcDir: string): Import[] {
  return sourceFiles(srcDir).flatMap((file) =>
    [
      ...readFileSync(join(srcDir, file), "utf8").matchAll(IMPORT_SPECIFIER),
    ].map(([, specifier]) => ({ file, specifier })),
  );
}

function sourceFiles(srcDir: string): string[] {
  return readdirSync(srcDir, { recursive: true, encoding: "utf8" })
    .filter((path) => SOURCE_FILE.test(path))
    .map((path) => path.split(sep).join("/"))
    .sort();
}

/** Only the app shell may call commands, to compose flows across slices. */
function isCommand(module: string): boolean {
  return module === "commands" || module.startsWith("commands/");
}

/** The rule for a zone other code leans on, which keeps it free of what it could otherwise reach. */
function leafRule(
  zone: Zone,
): { rule: string; mayImport: Zone["kind"][] } | undefined {
  if (zone.kind === "kernel") {
    return {
      rule: "the kernel may import only the kernel",
      mayImport: ["kernel"],
    };
  }
  if (zone.kind === "ui") {
    return {
      rule: "ui may import only the kernel and ui",
      mayImport: ["kernel", "ui"],
    };
  }
  if (zone.kind === "slice" && zone.module === "records") {
    return {
      rule: `records of slice "${zone.name}" may import only the kernel`,
      mayImport: ["kernel"],
    };
  }
  return undefined;
}

/** Where a path relative to the source directory belongs; anything else, even outside the tree, counts as the app shell. */
function zoneOf(path: string): Zone {
  const [top, name, ...module] = path.split("/");
  if (top === "kernel" || top === "ui") return { kind: top };
  if (top !== "slices") return { kind: "shell" };
  return {
    kind: "slice",
    name,
    module: module.join("/").replace(MODULE_EXTENSION, ""),
  };
}

/** Every file and folder under `srcDir`, reachable with or without its module extension. */
function sourceModules(srcDir: string): Set<string> {
  const paths = readdirSync(srcDir, { recursive: true, encoding: "utf8" }).map(
    (path) => path.split(sep).join("/"),
  );
  return new Set(
    paths.flatMap((path) => [path, path.replace(MODULE_EXTENSION, "")]),
  );
}

/** The source-relative path a non-relative specifier would name, whichever alias or root it goes through. */
function sourcePathOf(specifier: string): string {
  return specifier
    .replace(ALIAS_PREFIX, "")
    .replace(QUERY, "")
    .replace(MODULE_EXTENSION, "");
}
