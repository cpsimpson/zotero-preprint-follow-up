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

1. From this repository root, create an `.xpi` archive containing `manifest.json`, `bootstrap.js`, and `README.md`.
2. In Zotero, open `Tools -> Plugins`.
3. Click the gear icon, choose `Install Plugin From File...`, and select the `.xpi`.
