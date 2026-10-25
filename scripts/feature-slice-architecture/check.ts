/**
 * Keeps feature slices decoupled as docs/adr/0005 requires. Run on a source
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

type Import = { file: string; specifier: string; target: string };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const violations = findFeatureSliceViolations(process.argv[2] ?? "src");
  if (violations.length > 0) {
    console.error(violations.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Feature slices hold to ADR 0005.");
  }
}

export function findFeatureSliceViolations(srcDir: string): string[] {
  const violations: string[] = [];
  const queryDependencies = new Map<string, Set<string>>();
  for (const { file, specifier, target } of relativeImports(srcDir)) {
    const from = sliceOf(file);
    const to = sliceOf(target);
    // Records are the leaves every slice may read, so they import only the kernel.
    if (from?.module === "records" && to !== undefined) {
      violations.push(
        `records of slice "${from.name}" may import only the kernel: ${file} imports "${specifier}"`,
      );
      continue;
    }
    if (to === undefined || from?.name === to.name) continue;
    if (PUBLIC_MODULES.has(to.module)) {
      if (from && to.module !== "records") {
        const dependencies = queryDependencies.get(from.name) ?? new Set();
        queryDependencies.set(from.name, dependencies.add(to.name));
      }
      continue;
    }
    const importer = from ? `slice "${from.name}"` : "the app shell";
    const where = `${file} imports "${specifier}"`;
    if (!isCommand(to.module)) {
      violations.push(
        `${importer} imports non-public code of slice "${to.name}": ${where}`,
      );
    } else if (from) {
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

/** Every relative import in the source tree, as paths relative to `srcDir`. */
function relativeImports(srcDir: string): Import[] {
  return sourceFiles(srcDir).flatMap((file) =>
    [...readFileSync(join(srcDir, file), "utf8").matchAll(IMPORT_SPECIFIER)]
      .map(([, specifier]) => specifier)
      .filter((specifier) => specifier.startsWith("."))
      .map((specifier) => ({
        file,
        specifier,
        target: join(dirname(file), specifier),
      })),
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

/**
 * The slice a path belongs to and the module within it, without extension;
 * undefined for the kernel and the app shell.
 */
function sliceOf(path: string): { name: string; module: string } | undefined {
  const [top, name, ...module] = path.split("/");
  if (top !== "slices") return undefined;
  return { name, module: module.join("/").replace(MODULE_EXTENSION, "") };
}
