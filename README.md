# Canvas Card Colors

An expanded, easier color picker for Obsidian canvas cards (and edges).

## Features
- **Paint-bucket button** in the canvas selection toolbar opens the picker right above your selection
- **24-color default palette** (vivid, neutral, pastel) — fully editable: add, rename, reorder, delete
- **Obsidian's 6 theme colors** kept as an optional row
- **Recent colors** row
- **Hex input**, native color picker, and **eyedropper** (desktop) for any custom color
- **Live preview** — hover a swatch to see it and its hex code
- **Keyboard**: `1`–`9` apply the first nine palette colors, `0` removes color, `Esc` closes
- **Commands** you can bind to hotkeys: open picker, remove color, apply palette color 1–9
- **Right-click** any card → *Card colors…*
- **Import** a palette by pasting hex codes (e.g. from Coolors)
- Works on multiple selected cards at once

## Install
1. Unzip so you have a folder named `canvas-card-colors` containing `manifest.json`, `main.js`, `styles.css`.
2. Move that folder into `<your vault>/.obsidian/plugins/`.
3. In Obsidian: Settings → Community plugins → reload the list → enable **Canvas Card Colors**.

On iOS/Android, copy the folder into the vault's `.obsidian/plugins/` via Files / a sync service, then enable it the same way.

## Notes
Obsidian doesn't publish an official API for canvas internals, so this plugin uses the same internal hooks other canvas plugins rely on. A future Obsidian update could break the toolbar button; the commands and right-click entry are the fallback.
