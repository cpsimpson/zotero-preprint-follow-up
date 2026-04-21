# Preprint Follow-Up (Zotero Plugin)

This plugin adds a right-click action to Zotero items to look for likely peer-reviewed journal versions of preprints.

## Compatibility

- Zotero 9 and newer (tested target: Zotero 10)

## What It Does

1. Right-click one or more selected library items.
2. Click `Find Peer-Reviewed Version`.
3. The plugin queries Crossref and scores likely journal matches.
4. For each match, it adds/updates a child note on the original item and tags the item with `peer-reviewed-version-found`.

## Install

1. From this repository root, run `make xpi`.
2. In Zotero, open `Tools -> Plugins`.
3. Click the gear icon, choose `Install Plugin From File...`, and select the `.xpi`.

The built plugin file is written to `dist/`.

## Automatic Updates

- Plugin update manifest URL:
  `https://github.com/cpsimpson/zotero-preprint-follow-up/releases/latest/download/updates.json`
- Releases published from Git tags (for example `v0.1.1`) include:
  - `zotero-preprint-follow-up-<version>.xpi`
  - `updates.json`

## License

MIT (see `LICENSE`).
