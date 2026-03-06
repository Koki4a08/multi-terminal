# Releases

## Build locally

To build the Windows installer locally:

```bash
npm run dist
```

The installer is generated in `dist/`.

## GitHub Actions workflow

Workflow file:

- `.github/workflows/release.yml`

The workflow runs when:

- Code is pushed to `main`
- A tag matching `v*` is pushed
- The workflow is started manually with `workflow_dispatch`

## What the workflow does

1. Checks out the repository
2. Sets up Node.js 20
3. Sets up Python 3.11
4. Runs `npm ci`
5. Runs `npm run dist`
6. Uploads the generated `.exe` and `.blockmap` as workflow artifacts
7. If the ref is a tag, publishes those files to the GitHub Release

## Release process

Typical tagged release flow:

```bash
git tag v1.0.1
git push origin v1.0.1
```

Pushing the tag triggers the Windows build and uploads the installer assets to the matching GitHub Release.
