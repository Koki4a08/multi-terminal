# Publishing This Wiki

GitHub Wikis are stored in a separate repository named like:

```text
<repo-name>.wiki.git
```

## Option 1: Paste pages in the GitHub UI

1. Open the repository on GitHub.
2. Open the `Wiki` tab.
3. Create pages with these names:
   - `Home`
   - `Getting Started`
   - `User Guide`
   - `Development`
   - `Architecture`
   - `Releases`
4. Copy the contents from the matching files in this `wiki/` folder.

## Option 2: Push to the wiki repository

Example:

```bash
git clone https://github.com/<owner>/<repo>.wiki.git
cd <repo>.wiki
```

Then copy these files into the wiki repo and rename them to GitHub Wiki page names:

- `Home.md`
- `Getting-Started.md`
- `User-Guide.md`
- `Development.md`
- `Architecture.md`
- `Releases.md`
- `_Sidebar.md`

Commit and push them to publish the wiki.

## Included navigation files

- `_Sidebar.md`: side navigation for the wiki
- `_Footer.md`: footer links

## Suggested page mapping

- `wiki/Home.md` -> `Home.md`
- `wiki/Getting-Started.md` -> `Getting-Started.md`
- `wiki/User-Guide.md` -> `User-Guide.md`
- `wiki/Development.md` -> `Development.md`
- `wiki/Architecture.md` -> `Architecture.md`
- `wiki/Releases.md` -> `Releases.md`
- `wiki/_Sidebar.md` -> `_Sidebar.md`
- `wiki/_Footer.md` -> `_Footer.md`
