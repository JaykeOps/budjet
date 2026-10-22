# The Nix flake is the single toolchain, inside Dagger too

All CI runs as Dagger functions, so it can be run locally and in GitHub Actions alike. Every tool those functions need comes from the repo's `flake.nix`: Dagger containers are Nix containers running `nix develop -c …` against the same flake that humans and agents use, with the realised dev shell cached as a Dagger layer keyed only on `flake.nix` and `flake.lock`. We chose this over pinning upstream images (`node:x`, etc.) in the Dagger module, accepting slower cold runs (each GitHub Actions run starts with an empty Dagger cache and fetches the toolchain from cache.nixos.org), so there is exactly one definition of the toolchain and nothing can drift between a laptop, an agent sandbox, and CI.

## Consequences

- Any tool CI uses (linters, `cz`, Node, the package manager) must be added to the flake, not installed ad hoc in a Dagger function.
- Agents install Nix (Determinate Systems installer) and run every project tool through `nix develop -c <cmd>`.
