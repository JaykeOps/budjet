{
  description = "budjet: the single toolchain for humans, agents and Dagger (see docs/adr/0001)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    dagger = {
      url = "github:dagger/nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, dagger }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system} system);
    in
    {
      devShells = forAllSystems (pkgs: system: {
        default = pkgs.mkShell {
          packages = [
            pkgs.nodejs_22
            pkgs.pnpm
            pkgs.biome
            pkgs.commitizen
            pkgs.git
            pkgs.gh
            pkgs.zip
            dagger.packages.${system}.dagger
          ];

          # @playwright/test in package.json must stay pinned to this version.
          PLAYWRIGHT_BROWSERS_PATH = pkgs.playwright-driver.browsers;
          PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
          PLAYWRIGHT_NIX_VERSION = pkgs.playwright-driver.version;
          # Without fonts, headless Chromium lays text out at zero size and nothing is "visible".
          FONTCONFIG_FILE = pkgs.makeFontsConf { fontDirectories = [ pkgs.dejavu_fonts ]; };
        };
      });
    };
}
