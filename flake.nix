{
  description = "Config Drift Guard development and Playwright Chromium runtime";

  # Pinned to nixpkgs with Playwright 1.56.1 to match package.json.
  # When updating this revision, update @playwright/test in the same change.
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/f665af0cdb70ed27e1bd8f9fdfecaf451260fc55";

  outputs =
    { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };

      # A mismatched Playwright driver cannot resolve the expected browser revision.
      packageJson = builtins.fromJSON (builtins.readFile ./package.json);
      playwrightVersion = packageJson.devDependencies."@playwright/test";
      driver = pkgs.playwright-driver;
    in
    {
      devShells.${system}.default =
        assert pkgs.lib.assertMsg (driver.version == playwrightVersion)
          "Playwright mismatch: nixpkgs driver ${driver.version} != npm @playwright/test ${playwrightVersion}. Update both together.";
        pkgs.mkShell {
          packages = with pkgs; [
            nodejs_24
            corepack
            python3
            driver.browsers
          ];

          PLAYWRIGHT_BROWSERS_PATH = "${driver.browsers}";
          PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
          # Nix provides the runtime libraries in its patched browser closure;
          # Playwright's FHS-based host dependency probe cannot detect them.
          PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "1";
          COREPACK_ENABLE_DOWNLOAD_PROMPT = "0";
        };
    };
}
