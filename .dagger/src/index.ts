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
        "dist",
        "test-results",
        "playwright-report",
        ".direnv",
        ".dagger/sdk",
      ],
    })
    source: Directory,
  ) {
    this.source = source;
  }

  /**
   * Run every check: commit messages, lint, typecheck, unit tests and the build.
   * Pass --pr-title in CI, where the squash-merged PR title is the commit that lands.
   */
  @func()
  async check(prTitle?: string): Promise<string> {
    await Promise.all([
      this.checkCommits(prTitle),
      this.lint(),
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
      return this.nix(this.toolchain(), [
        "cz",
        "check",
        "--message",
        prTitle,
      ]).stdout();
    }

    const checked = this.nix(
      this.withGit(),
      ["cz", "check", "--rev-range", `${base}..HEAD`],
      {
        expect: ReturnType.Any,
      },
    );
    const exitCode = await checked.exitCode();
    if (exitCode === CZ_NO_COMMITS_FOUND) return `No commits since ${base}.`;
    if (exitCode !== 0) throw new Error(await output(checked));
    return checked.stdout();
  }

  /** Lint and format-check with Biome. */
  @func()
  async lint(): Promise<string> {
    return this.nix(this.workspace(), ["biome", "check", "."]).stdout();
  }

  /** Typecheck with tsc. */
  @func()
  async typecheck(): Promise<string> {
    return this.nix(this.workspace(), ["pnpm", "typecheck"]).stdout();
  }

  /** Run the Vitest unit tests. */
  @func()
  async test(): Promise<string> {
    return this.nix(this.workspace(), ["pnpm", "test"]).stdout();
  }

  /** Build the app; the version is stamped into it. */
  @func()
  build(version = "0.0.0-dev"): Directory {
    return this.nix(
      this.workspace().withEnvVariable("BUDJET_VERSION", version),
      ["pnpm", "build"],
    ).directory("/src/dist");
  }

  /** Run the Playwright end-to-end tests against a production build. */
  @func()
  async endToEnd(): Promise<string> {
    const built = this.nix(this.workspace(), ["pnpm", "build"]);
    return this.nix(built.withEnvVariable("CI", "true"), [
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
    const next = this.nix(
      this.withGit(),
      ["cz", "bump", "--get-next", "--yes"],
      {
        expect: ReturnType.Any,
      },
    );
    const exitCode = await next.exitCode();
    if (exitCode === CZ_NO_COMMITS_TO_BUMP) return "";
    if (exitCode !== 0) throw new Error(await output(next));
    return (await next.stdout()).trim();
  }

  /**
   * Cut a Release if the commits call for one: create the GitHub Release (and
   * with it the tag) at `sha`, with release notes and the built app attached.
   * Returns the released version, or "" when there was nothing to release.
   */
  @func()
  async release(token: Secret, repo: string, sha: string): Promise<string> {
    const version = await this.nextVersion();
    if (version === "") return "";
    const tag = `v${version}`;

    // With no CHANGELOG.md in the repo (docs/adr/0003), bound the notes by the
    // previous tag or cz repeats the whole history in every release.
    const previousTag = this.withGit().withExec(
      ["git", "describe", "--tags", "--abbrev=0", "--match", "v*"],
      { expect: ReturnType.Any },
    );
    const since =
      (await previousTag.exitCode()) === 0
        ? ["--start-rev", (await previousTag.stdout()).trim()]
        : [];
    const notes = this.nix(this.withGit(), [
      "cz",
      "changelog",
      "--dry-run",
      "--unreleased-version",
      tag,
      ...since,
    ]);

    await this.nix(
      this.toolchain()
        .withDirectory("/release/dist", this.build(version))
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

    return version;
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
  private withGit(): Container {
    return this.toolchain()
      .withEnvVariable("GIT_CONFIG_COUNT", "1")
      .withEnvVariable("GIT_CONFIG_KEY_0", "safe.directory")
      .withEnvVariable("GIT_CONFIG_VALUE_0", "*")
      .withDirectory("/src", this.source);
  }

  /** The toolchain plus installed dependencies and the source, without git history. */
  private workspace(): Container {
    const installed = this.nix(
      this.toolchain()
        .withMountedCache("/pnpm-store", dag.cacheVolume("budjet-pnpm-store"))
        .withDirectory("/src", this.source, {
          include: ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"],
        }),
      ["pnpm", "install", "--frozen-lockfile", "--store-dir", "/pnpm-store"],
    );
    return installed.withDirectory("/src", this.source, { exclude: [".git"] });
  }

  private nix(
    container: Container,
    cmd: string[],
    opts?: { expect?: ReturnType },
  ): Container {
    return container.withExec(
      ["nix", "develop", "path:/toolchain", "-c", ...cmd],
      opts,
    );
  }
}

async function output(container: Container): Promise<string> {
  return `${await container.stdout()}${await container.stderr()}`;
}
