# Releasing

This project uses semantic versioning. Releases are cut from `main`.

## Cutting a release

1. Make sure `main` is green and you are up to date:
   ```sh
   git checkout main && git pull
   ```
2. Pick the next version `X.Y.Z` per semver. Update `package.json` and move the `[Unreleased]` section of `CHANGELOG.md` under a new `[X.Y.Z] - YYYY-MM-DD` heading. Update the compare links at the bottom of the changelog.
3. Commit the bump:
   ```sh
   git commit -am "chore(release): X.Y.Z"
   ```
4. Tag and push:
   ```sh
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin main vX.Y.Z
   ```
5. Create a GitHub release for the tag and paste the changelog section as the body:
   ```sh
   gh release create vX.Y.Z --title "vX.Y.Z" --notes-file <(awk '/^## \[X.Y.Z\]/,/^## \[/' CHANGELOG.md | sed '$d')
   ```
6. Publish to npm:
   ```sh
   npm publish
   ```
   `prepublishOnly` rebuilds `dist/` from scratch so stale outputs cannot ship.

## Sanity checks before publishing

- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm publish --dry-run` and confirm the tarball contains only files from the current `src/`.
