# Agent rules

budjet is a local-first React PWA. Read `GLOSSARY.md` for the domain language and `docs/adr/` for why the repo is set up the way it is.

## Toolchain

Every tool comes from `flake.nix` (ADR 0001). Run project commands as `nix develop -c <cmd>`, e.g. `nix develop -c pnpm install`.

- No `nix` on the machine: install it with the Determinate Systems installer (`curl -sSfL https://install.determinate.systems/nix | sh -s -- install`; in a container without systemd add `linux --init none`), then use `nix develop -c` as above.
- A tool is missing: add it to the flake's dev shell. The flake is also what Dagger runs inside, so a tool installed any other way works on your machine and fails in CI.

## Feature slices

Code is organised as feature slices (ADR 0005). A slice lives in `src/slices/<slice>/`, and only these files are reachable from outside it:

- `index.ts`: the public entry point. Its public queries, the hooks that wrap them, and its UI. Another slice imports it as `../<slice>`.
- `records.ts`: the change record types it publishes. Any slice may read them.
- `commands.ts` (or `commands/`): its commands. Only the app shell (code in `src/` outside `src/slices/`) may import them.

Everything else in a slice is private. Query dependencies (one slice importing another's `index.ts`) must not form a cycle. `dagger call check-feature-slices` enforces all of this with `scripts/feature-slice-architecture/check.ts`, and it runs as part of `dagger call check`.

## Checks

CI is the Dagger module in `.dagger/`; GitHub Actions only calls it. Before every push, run and pass:

```sh
nix develop -c dagger call check
nix develop -c dagger call end-to-end
```

`dagger functions` lists the rest. New CI logic goes in the Dagger module so it runs locally first; the workflow YAML stays a thin `dagger call`. The one exception is the GitHub Pages deploy in `release.yml`, which uses GitHub's own actions for short-lived credentials.

Hooks and install scripts stay off (ADR 0002): commit with plain `git commit`, and when a dependency fails `pnpm install` because it wants a build script, stop and ask the human whether to acknowledge it as `<pkg>: false` under `allowBuilds` in `pnpm-workspace.yaml`.

## Commits, branches and PRs

- Commit messages follow Conventional Commits (`feat: …`, `fix(scope): …`); `dagger call check-commits` verifies them.
- Branch names: `<type>/<slug>`, e.g. `feat/data-folder`. Work reaches `master` only through a PR.
- Push over HTTPS: `git push https://github.com/JaykeOps/budjet.git <branch>`, then `gh pr create --head <branch>`. Agent sandboxes get GitHub credentials only on HTTPS, and `origin` may be an SSH remote.
- PRs are squash-merged, so the **PR title** is the commit that lands and drives the release. Make it a Conventional Commit.
- One PR is one change a single title describes. If the title needs "and", split the PR.
- Aim for under ~400 changed lines, excluding lockfiles and generated files.
- Refactors ship in their own `refactor:` PR, separate from behaviour changes.

## Releases

Merging to `master` releases automatically: `cz` derives the next version from the commits since the last tag (ADR 0003). The git tag is the version; leave `version` in `package.json` at `0.0.0`.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues (JaykeOps/budjet) via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
