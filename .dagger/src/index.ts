/**
 * budjet's CI: every check, the build and the release.
 *
 * Each function runs inside a Nix container using the repo's own flake, so the
 * tools are exactly the ones humans and agents get from `nix develop`
 * (docs/adr/0001). GitHub Actions only calls these functions.
 */
import {
  argument,
  type Container,
  type Directory,
  dag,
  func,
  object,
  ReturnType,
  type Secret,
} from "@dagger.io/dagger";

const NIX_IMAGE =
  "nixos/nix:2.35.3@sha256:ff480dbb23511aa1c10710aa068ceea5b93fed9bfce5f5379f3a6b07282cbc7b";

const NIX_CONFIG = [
  "experimental-features = nix-command flakes",
  // Dagger already isolates the container; Nix's own build sandbox needs privileges it lacks.
  "sandbox = false",
].join("\n");

// cz exit codes: https://commitizen-tools.github.io/commitizen/exit_codes/
const CZ_NO_COMMITS_FOUND = 3;
const CZ_NO_COMMITS_TO_BUMP = 21;

@object()
export class Budjet {
  source: Directory;

  constructor(
    @argument({
      defaultPath: "/",
      ignore: [
        "**/node_modules",
        ".pnpm-store",
        "dist",
        "test-results",
        "playwright-report",
        ".direnv",
        ".dagger/sdk",
        "result",
      ],
    })
    source: Directory,
  ) {
    this.source = source;
  }

  /**
   * Run every check: commit messages, lint, feature slices, typecheck, unit
   * tests and the build.
   * Pass --pr-title in CI, where the squash-merged PR title is the commit that lands.
   */
  @func()
  async check(prTitle?: string): Promise<string> {
    await Promise.all([
      this.checkCommits(prTitle),
      this.lint(),
      this.checkFeatureSlices(),
      this.typecheck(),
      this.test(),
      this.build().sync(),
    ]);
    return "All checks passed.";
  }

  /**
   * Check commit messages follow Conventional Commits: the given PR title if
   * set, otherwise every commit on this branch since `base`.
   */
  @func()
  async checkCommits(
    prTitle?: string,
    base = "origin/master",
  ): Promise<string> {
    if (prTitle !== undefined) {
      return this.inDevShell(this.toolchain(), [
        "cz",
        "check",
        "--message",
        prTitle,
      ]).stdout();
    }
    return stdoutOr(
      this.inDevShell(
        this.withHistory(),
        ["cz", "check", "--rev-range", `${base}..HEAD`],
        ReturnType.Any,
      ),
      { [CZ_NO_COMMITS_FOUND]: `No commits since ${base}.` },
    );
  }

  /** Lint and format-check with Biome. */
  @func()
  async lint(): Promise<string> {
    return this.inDevShell(this.workspace(), ["pnpm", "lint"]).stdout();
  }

  /** Check feature slices only reach each other through their public code (docs/adr/0005). */
  @func()
  async checkFeatureSlices(): Promise<string> {
    return this.inDevShell(
      this.toolchain().withDirectory("/src", this.source, {
        include: ["scripts/feature-slice-architecture/check.ts", "src"],
      }),
      ["node", "scripts/feature-slice-architecture/check.ts"],
    ).stdout();
  }

  /** Typecheck with tsc. */
  @func()
  async typecheck(): Promise<string> {
    return this.inDevShell(this.workspace(), ["pnpm", "typecheck"]).stdout();
  }

  /** Run the Vitest unit tests. */
  @func()
  async test(): Promise<string> {
    return this.inDevShell(this.workspace(), ["pnpm", "test"]).stdout();
  }

  /** Build the app, stamping `tag` into it when given. */
  @func()
  build(tag?: string): Directory {
    return this.built(tag).directory("/src/dist");
  }

  /** Run the Playwright end-to-end tests against a production build. */
  @func()
  async endToEnd(): Promise<string> {
    return this.inDevShell(this.built().withEnvVariable("CI", "true"), [
      "pnpm",
      "e2e",
    ]).stdout();
  }

  /**
   * The version the commits since the last tag call for, or "" when none of
   * them warrants a release.
   */
  @func()
  async nextVersion(): Promise<string> {
    const next = await stdoutOr(
      this.inDevShell(
        this.withHistory(),
        ["cz", "bump", "--get-next", "--yes"],
        ReturnType.Any,
      ),
      { [CZ_NO_COMMITS_FOUND]: "", [CZ_NO_COMMITS_TO_BUMP]: "" },
    );
    return next.trim();
  }

  /**
   * Cut a Release if the commits call for one: create the GitHub Release (and
   * with it the tag) at `sha`, with release notes and the built app attached.
   * Returns that same build to deploy, or an empty directory when there was
   * nothing to release.
   */
  @func()
  async release(token: Secret, repo: string, sha: string): Promise<Directory> {
    const version = await this.nextVersion();
    if (version === "") return dag.directory();
    const tag = `v${version}`;
    const dist = this.build(tag);

    // With no CHANGELOG.md in the repo (docs/adr/0003), bound the notes by the
    // previous tag or cz repeats the whole history in every release. Before the
    // first Release there is no tag; `git describe` would exit 128 there, which
    // Dagger fails on even with ReturnType.Any, so list the tags instead.
    const tags = await this.inDevShell(this.withHistory(), [
      "git",
      "tag",
      "--list",
      "v*",
      "--merged",
      "HEAD",
      "--sort=-v:refname",
    ]).stdout();
    const previousTag = tags.split("\n")[0].trim();
    const since = previousTag ? ["--start-rev", previousTag] : [];
    const notes = this.inDevShell(this.withHistory(), [
      "cz",
      "changelog",
      "--dry-run",
      "--unreleased-version",
      tag,
      ...since,
    ]);

    await this.inDevShell(
      this.toolchain()
        .withDirectory("/release/dist", dist)
        .withNewFile("/release/notes.md", await notes.stdout())
        .withWorkdir("/release")
        .withSecretVariable("GH_TOKEN", token),
      [
        "sh",
        "-c",
        'cd dist && zip -qr "../budjet-$1.zip" . && cd .. && ' +
          'gh release create "$1" --repo "$2" --target "$3" --title "$1" --notes-file notes.md "budjet-$1.zip"',
        "release",
        tag,
        repo,
        sha,
      ],
    ).sync();

    return dist;
  }

  /** A Nix container with the flake's dev shell realised, keyed only on the flake files. */
  private toolchain(): Container {
    return dag
      .container()
      .from(NIX_IMAGE)
      .withEnvVariable("NIX_CONFIG", NIX_CONFIG)
      .withDirectory("/toolchain", this.source, {
        include: ["flake.nix", "flake.lock"],
      })
      .withExec(["nix", "develop", "path:/toolchain", "-c", "true"])
      .withWorkdir("/src");
  }

  /** The toolchain plus the source with its git history, for cz. */
  private withHistory(): Container {
    return this.toolchain()
      .withEnvVariable("GIT_CONFIG_COUNT", "1")
      .withEnvVariable("GIT_CONFIG_KEY_0", "safe.directory")
      .withEnvVariable("GIT_CONFIG_VALUE_0", "*")
      .withDirectory("/src", this.source);
  }

  /** The toolchain plus installed dependencies and the source, without git history. */
  private workspace(): Container {
    const installed = this.inDevShell(
      this.toolchain()
        .withMountedCache("/pnpm-store", dag.cacheVolume("budjet-pnpm-store"))
        .withDirectory("/src", this.source, {
          include: ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"],
        }),
      ["pnpm", "install", "--frozen-lockfile", "--store-dir", "/pnpm-store"],
    );
    return installed.withDirectory("/src", this.source, { exclude: [".git"] });
  }

  /** The workspace after a production build; the app's default version applies without `tag`. */
  private built(tag?: string): Container {
    const workspace = tag
      ? this.workspace().withEnvVariable("BUDJET_VERSION", tag)
      : this.workspace();
    return this.inDevShell(workspace, ["pnpm", "build"]);
  }

  private inDevShell(
    container: Container,
    cmd: string[],
    expect = ReturnType.Success,
  ): Container {
    return container.withExec(
      ["nix", "develop", "path:/toolchain", "-c", ...cmd],
      { expect },
    );
  }
}

/** Stdout of an exec run with `ReturnType.Any`, or the fallback for an expected exit code. */
async function stdoutOr(
  container: Container,
  fallbacks: Record<number, string>,
): Promise<string> {
  const exitCode = await container.exitCode();
  if (exitCode === 0) return container.stdout();
  if (exitCode in fallbacks) return fallbacks[exitCode];
  throw new Error(`${await container.stdout()}${await container.stderr()}`);
}
