# Releasing the extension

Releases run from GitHub Actions. Nobody publishes from a laptop.

## One-time setup

1. **Marketplace token.** In Azure DevOps (https://dev.azure.com), create a personal access token with
   organization **All accessible organizations** and scope **Marketplace › Manage**. Make sure the
   `TharakaChathuranga` publisher exists at https://marketplace.visualstudio.com/manage. Save the token as the
   repo secret `VSCE_PAT`. Without it the release skips the Marketplace.
2. **Open VSX token** (optional, for Cursor, VSCodium and similar editors). Sign in at https://open-vsx.org,
   sign the publisher agreement, and create an access token. Create the namespace once:
   `npx ovsx create-namespace TharakaChathuranga -p <token>`. Save the token as the repo secret `OVSX_PAT`.
   Without it the release skips Open VSX.

## Cutting a release

Go to **Actions › Release extension › Run workflow** on `main` and pick the bump:

| Bump | Use for |
|---|---|
| `patch` | fixes |
| `minor` | new features |
| `major` | breaking changes to settings or `skills.json` |
| `none` | publish the version already in `package.json`, or retry a release that failed partway |

The workflow:

1. bumps `package.json` and `package-lock.json`,
2. builds and packages the `.vsix`, and stops here if the build fails,
3. commits `chore(extension): release <version>` to `main` and pushes the tag `extension-v<version>`,
4. publishes the same `.vsix` to the Marketplace and Open VSX, skipping a registry that already has that version,
5. creates a GitHub Release with the `.vsix` attached. Its notes list the commits under `vscode-extension/` since the
   previous release.

Each pull request that touches `vscode-extension/` runs **Build extension**, which packages the extension and
uploads the `.vsix` as a build artifact you can install to test.

Library releases use separate `library-v*` tags and are not affected.
