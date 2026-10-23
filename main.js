'use strict';

const { Plugin, PluginSettingTab, Setting, ItemView, setIcon, Notice } = require('obsidian');

/* ------------------------------------------------------------------ */
/* Defaults                                                            */
/* ------------------------------------------------------------------ */

const DEFAULT_SWATCHES = [
  // Vivid
  { name: 'Red', color: '#e03131' },
  { name: 'Orange', color: '#f76707' },
  { name: 'Amber', color: '#f59f00' },
  { name: 'Yellow', color: '#fcc419' },
  { name: 'Lime', color: '#66a80f' },
  { name: 'Green', color: '#2f9e44' },
  { name: 'Teal', color: '#0ca678' },
  { name: 'Cyan', color: '#1098ad' },
  // Cool / neutral
  { name: 'Blue', color: '#1c7ed6' },
  { name: 'Indigo', color: '#4263eb' },
  { name: 'Violet', color: '#7048e8' },
  { name: 'Grape', color: '#ae3ec9' },
  { name: 'Pink', color: '#d6336c' },
  { name: 'Brown', color: '#8d6e63' },
  { name: 'Slate', color: '#495057' },
  { name: 'Gray', color: '#868e96' },
  // Pastels
  { name: 'Rose', color: '#ffc9c9' },
  { name: 'Peach', color: '#ffd8a8' },
  { name: 'Butter', color: '#ffec99' },
  { name: 'Pistachio', color: '#d8f5a2' },
  { name: 'Mint', color: '#b2f2bb' },
  { name: 'Ice', color: '#99e9f2' },
  { name: 'Sky', color: '#a5d8ff' },
  { name: 'Lilac', color: '#d0bfff' },
];

const THEME_COLORS = [
  { name: 'Theme red', color: '1' },
  { name: 'Theme orange', color: '2' },
  { name: 'Theme yellow', color: '3' },
  { name: 'Theme green', color: '4' },
  { name: 'Theme cyan', color: '5' },
  { name: 'Theme purple', color: '6' },
];

const DEFAULT_SETTINGS = {
  swatches: DEFAULT_SWATCHES,
  recent: [],
  maxRecent: 10,
  columns: 8,
  swatchSize: 28,
  showThemeColors: true,
  showRecent: true,
  closeOnPick: true,
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const isThemeColor = (c) => typeof c === 'string' && /^[1-6]$/.test(c);

function swatchCss(color) {
  return isThemeColor(color) ? `rgb(var(--canvas-color-${color}))` : color;
}

function normalizeHex(value) {
  if (!value) return null;
  let v = String(value).trim().replace(/^#?/, '#');
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    v = '#' + v.slice(1).split('').map((c) => c + c).join('');
  }
  return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null;
}

/** Resolve a theme color ("1"–"6") to a hex string using the current theme. */
function themeHex(n) {
  const raw = getComputedStyle(document.body).getPropertyValue(`--canvas-color-${n}`).trim();
  const parts = raw.split(',').map((p) => parseInt(p, 10));
  if (parts.length < 3 || parts.some(isNaN)) return null;
  return '#' + parts.slice(0, 3).map((p) => p.toString(16).padStart(2, '0')).join('');
}

function toHex(color) {
  if (!color) return null;
  return isThemeColor(color) ? themeHex(color) : normalizeHex(color);
}

/* ------------------------------------------------------------------ */
/* Popover                                                             */
/* ------------------------------------------------------------------ */

class ColorPopover {
  constructor(plugin, canvas, anchor) {
    this.plugin = plugin;
    this.canvas = canvas;
    this.anchor = anchor;
    this.current = plugin.getSelectionColor(canvas); // undefined = mixed, null = none
    this.busy = false; // true while eyedropper / native picker is open
    this.onKey = this.onKey.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
  }

  open() {
    const s = this.plugin.settings;
    const el = (this.el = document.body.createDiv({ cls: 'ccp-popover' }));
    el.style.setProperty('--ccp-cols', String(s.columns));
    el.style.setProperty('--ccp-size', `${s.swatchSize}px`);

    // Header
    const header = el.createDiv({ cls: 'ccp-header' });
    header.createSpan({ cls: 'ccp-title', text: 'Card color' });
    const n = this.canvas.selection.size;
    header.createSpan({ cls: 'ccp-count', text: `${n} selected` });

    // Preview / custom row
    const row = el.createDiv({ cls: 'ccp-row' });
    this.previewEl = row.createDiv({ cls: 'ccp-preview' });
    this.hexInput = row.createEl('input', {
      cls: 'ccp-hex',
      attr: { type: 'text', placeholder: '#hex', spellcheck: 'false', maxlength: '7' },
    });
    this.nativeInput = row.createEl('input', {
      cls: 'ccp-native',
      attr: { type: 'color', 'aria-label': 'Custom color' },
    });

    if (window.EyeDropper) {
      const eye = row.createEl('button', {
        cls: 'clickable-icon ccp-icon-btn',
        attr: { 'aria-label': 'Pick a color from the screen' },
      });
      setIcon(eye, 'pipette');
      eye.addEventListener('click', async () => {
        this.busy = true;
        try {
          const result = await new window.EyeDropper().open();
          this.pick(normalizeHex(result.sRGBHex));
        } catch (_) {
          /* cancelled */
        } finally {
          this.busy = false;
        }
      });
    }

    const clear = row.createEl('button', {
      cls: 'clickable-icon ccp-icon-btn',
      attr: { 'aria-label': 'Remove color (0)' },
    });
    setIcon(clear, 'ban');
    clear.addEventListener('click', () => this.pick(null));

    this.hexInput.addEventListener('input', () => {
      const hex = normalizeHex(this.hexInput.value);
      if (hex) this.showPreview(hex);
    });
    this.hexInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const hex = normalizeHex(this.hexInput.value);
        if (hex) this.pick(hex);
        else new Notice('Enter a hex color like #3fa2c4 or #3ac');
      }
    });
    this.nativeInput.addEventListener('click', () => (this.busy = true));
    this.nativeInput.addEventListener('input', () => {
      this.showPreview(this.nativeInput.value);
      this.hexInput.value = this.nativeInput.value;
    });
    this.nativeInput.addEventListener('change', () => {
      this.busy = false;
      this.pick(normalizeHex(this.nativeInput.value));
    });

    // Sections
    this.swatchEls = [];
    if (s.showThemeColors) {
      this.section('Theme', THEME_COLORS, false);
    }
    this.section('Palette', s.swatches, true);
    if (s.showRecent && s.recent.length) {
      this.section(
        'Recent',
        s.recent.map((c) => ({ name: isThemeColor(c) ? `Theme ${c}` : c, color: c })),
        false
      );
    }

    el.createDiv({ cls: 'ccp-hint', text: '1–9 apply palette · 0 remove · Esc close' });

    this.resetPreview();
    this.position();

    document.addEventListener('keydown', this.onKey, true);
    // Defer so the click that opened the popover doesn't immediately close it
    window.setTimeout(() => document.addEventListener('pointerdown', this.onPointerDown, true), 0);
  }

  section(label, items, numbered) {
    if (!items.length) return;
    this.el.createDiv({ cls: 'ccp-label', text: label });
    const grid = this.el.createDiv({ cls: 'ccp-grid' });
    items.forEach((item, i) => {
      const hex = toHex(item.color);
      const key = numbered && i < 9 ? ` · ${i + 1}` : '';
      const btn = grid.createEl('button', {
        cls: 'ccp-swatch',
        attr: {
          'aria-label': `${item.name || hex || item.color}${hex && item.name ? ` · ${hex}` : ''}${key}`,
          'data-tooltip-position': 'top',
        },
      });
      btn.dataset.color = item.color;
      btn.style.background = swatchCss(item.color);
      if (numbered && i < 9) btn.createSpan({ cls: 'ccp-key', text: String(i + 1) });
      if (this.current !== undefined && this.same(item.color, this.current)) btn.addClass('is-active');
      btn.addEventListener('mouseenter', () => this.showPreview(item.color));
      btn.addEventListener('mouseleave', () => this.resetPreview());
      btn.addEventListener('click', () => this.pick(item.color));
      this.swatchEls.push(btn);
    });
  }

  same(a, b) {
    if (!a || !b) return a === b;
    return String(a).toLowerCase() === String(b).toLowerCase();
  }

  showPreview(color) {
    this.previewEl.toggleClass('is-none', !color);
    this.previewEl.style.background = color ? swatchCss(color) : '';
    if (document.activeElement !== this.hexInput) {
      this.hexInput.value = toHex(color) || '';
    }
  }

  resetPreview() {
    if (this.current === undefined) {
      // Mixed selection
      this.previewEl.addClass('is-mixed');
      this.previewEl.style.background = '';
      if (document.activeElement !== this.hexInput) this.hexInput.value = '';
      this.hexInput.placeholder = 'mixed';
      return;
    }
    this.previewEl.removeClass('is-mixed');
    this.showPreview(this.current);
    const hex = toHex(this.current);
    if (hex) this.nativeInput.value = hex;
  }

  pick(color) {
    if (color === undefined) return;
    this.plugin.applyColor(this.canvas, color);
    this.current = color;
    if (this.plugin.settings.closeOnPick) {
      this.close();
    } else {
      this.swatchEls.forEach((b) => b.toggleClass('is-active', this.same(b.dataset.color, color)));
      this.resetPreview();
    }
  }

  onKey(e) {
    if (!this.el) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.close();
      return;
    }
    if (e.target instanceof HTMLInputElement) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === '0') return this.pick(null);
      const sw = this.plugin.settings.swatches[parseInt(e.key, 10) - 1];
      if (sw) this.pick(sw.color);
    }
  }

  onPointerDown(e) {
    if (this.busy || !this.el) return;
    if (!this.el.contains(e.target)) this.close();
  }

  position() {
    const r = this.el.getBoundingClientRect();
    const m = 8;
    const a = this.anchor;
    let x;
    let y;
    if (a && 'width' in a) {
      // Anchor is a DOMRect (toolbar button): prefer above, fall back to below
      x = a.left + a.width / 2 - r.width / 2;
      y = a.top - r.height - m;
      if (y < m) y = a.bottom + m;
    } else if (a) {
      x = a.x;
      y = a.y;
    } else {
      const c = this.canvas.wrapperEl
        ? this.canvas.wrapperEl.getBoundingClientRect()
        : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
      x = c.left + c.width / 2 - r.width / 2;
      y = c.top + c.height / 2 - r.height / 2;
    }
    x = Math.max(m, Math.min(x, window.innerWidth - r.width - m));
    y = Math.max(m, Math.min(y, window.innerHeight - r.height - m));
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
  }

  close() {
    document.removeEventListener('keydown', this.onKey, true);
    document.removeEventListener('pointerdown', this.onPointerDown, true);
    if (this.el) this.el.remove();
    this.el = null;
    if (this.plugin.popover === this) this.plugin.popover = null;
  }
}

/* ------------------------------------------------------------------ */
/* Plugin                                                              */
/* ------------------------------------------------------------------ */

module.exports = class CanvasCardColors extends Plugin {
  async onload() {
    await this.loadSettings();
    this.popover = null;
    this.lastPointer = null;
    this.observed = new WeakSet();
    this.observers = [];

    this.addSettingTab(new CardColorSettingTab(this.app, this));

    // Remember where right-clicks happen so context-menu entries open the picker there
    this.registerDomEvent(
      document,
      'contextmenu',
      (e) => (this.lastPointer = { x: e.clientX, y: e.clientY }),
      true
    );

    // Toolbar button on canvas selection menus
    this.app.workspace.onLayoutReady(() => this.attachToCanvases());
    this.registerEvent(this.app.workspace.on('layout-change', () => this.attachToCanvases()));
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.attachToCanvases()));

    // Right-click menus (undocumented but stable canvas events)
    this.registerEvent(
      this.app.workspace.on('canvas:node-menu', (menu, node) => this.addMenuItem(menu, node && node.canvas))
    );
    this.registerEvent(
      this.app.workspace.on('canvas:selection-menu', (menu, canvas) => this.addMenuItem(menu, canvas))
    );

    // Commands (assign hotkeys in Settings → Hotkeys)
    this.addCommand({
      id: 'open-picker',
      name: 'Open card color picker',
      checkCallback: (checking) => {
        const canvas = this.getActiveCanvas();
        if (!canvas || !canvas.selection || canvas.selection.size === 0) return false;
        if (!checking) this.openPicker(canvas, null);
        return true;
      },
    });
    this.addCommand({
      id: 'clear-color',
      name: 'Remove color from selected cards',
      checkCallback: (checking) => {
        const canvas = this.getActiveCanvas();
        if (!canvas || !canvas.selection || canvas.selection.size === 0) return false;
        if (!checking) this.applyColor(canvas, null);
        return true;
      },
    });
    for (let i = 1; i <= 9; i++) {
      this.addCommand({
        id: `apply-swatch-${i}`,
        name: `Apply palette color ${i}`,
        checkCallback: (checking) => {
          const canvas = this.getActiveCanvas();
          const sw = this.settings.swatches[i - 1];
          if (!canvas || !sw || !canvas.selection || canvas.selection.size === 0) return false;
          if (!checking) this.applyColor(canvas, sw.color);
          return true;
        },
      });
    }
  }

  onunload() {
    if (this.popover) this.popover.close();
    this.observers.forEach((o) => o.disconnect());
    document.querySelectorAll('.ccp-menu-btn').forEach((el) => el.remove());
  }

  async loadSettings() {
    const data = (await this.loadData()) || {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    if (!Array.isArray(this.settings.swatches)) this.settings.swatches = [];
    if (!data.swatches) this.settings.swatches = DEFAULT_SWATCHES.map((s) => ({ ...s }));
    if (!Array.isArray(this.settings.recent)) this.settings.recent = [];
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  /* ---- canvas access ---- */

  getActiveCanvas() {
    const view = this.app.workspace.getActiveViewOfType(ItemView);
    if (!view || view.getViewType() !== 'canvas') return null;
    return view.canvas || null;
  }

  getSelectionColor(canvas) {
    const colors = new Set();
    for (const item of canvas.selection) {
      const data = typeof item.getData === 'function' ? item.getData() : {};
      colors.add(data.color ? String(data.color) : null);
    }
    if (colors.size !== 1) return undefined; // mixed or empty
    return [...colors][0];
  }

  applyColor(canvas, color) {
    const items = [...(canvas.selection || [])];
    if (!items.length) {
      new Notice('Select one or more cards first');
      return;
    }
    for (const item of items) {
      if (typeof item.setColor === 'function') {
        item.setColor(color || '');
      } else if (typeof item.getData === 'function' && typeof item.setData === 'function') {
        const data = { ...item.getData() };
        if (color) data.color = color;
        else delete data.color;
        item.setData(data);
      }
    }
    if (typeof canvas.requestSave === 'function') canvas.requestSave();
    if (color) this.pushRecent(color);
  }

  pushRecent(color) {
    const c = String(color).toLowerCase();
    const max = this.settings.maxRecent;
    this.settings.recent = [c, ...this.settings.recent.filter((r) => r !== c)].slice(0, max);
    this.saveSettings();
  }

  openPicker(canvas, anchor) {
    if (this.popover) this.popover.close();
    if (!canvas.selection || canvas.selection.size === 0) {
      new Notice('Select one or more cards first');
      return;
    }
    this.popover = new ColorPopover(this, canvas, anchor);
    this.popover.open();
  }

  /* ---- UI injection ---- */

  addMenuItem(menu, canvas) {
    if (!menu || !canvas) return;
    menu.addItem((item) =>
      item
        .setTitle('Card colors…')
        .setIcon('paint-bucket')
        .onClick(() => this.openPicker(canvas, this.lastPointer))
    );
  }

  attachToCanvases() {
    for (const leaf of this.app.workspace.getLeavesOfType('canvas')) {
      const view = leaf.view;
      const canvas = view && view.canvas;
      if (!canvas) continue;
      this.ensureButton(view, canvas);
      if (this.observed.has(view.containerEl)) continue;
      this.observed.add(view.containerEl);

      let queued = false;
      const obs = new MutationObserver(() => {
        if (queued) return;
        queued = true;
        window.requestAnimationFrame(() => {
          queued = false;
          this.ensureButton(view, canvas);
        });
      });
      obs.observe(view.containerEl, { childList: true, subtree: true });
      this.observers.push(obs);
    }
  }

  ensureButton(view, canvas) {
    const menuEl =
      (canvas.menu && canvas.menu.menuEl) || view.containerEl.querySelector('.canvas-menu');
    if (!menuEl || !menuEl.isConnected || menuEl.querySelector('.ccp-menu-btn')) return;
    const btn = menuEl.createEl('button', {
      cls: 'clickable-icon ccp-menu-btn',
      attr: { 'aria-label': 'Card colors', 'data-tooltip-position': 'top' },
    });
    setIcon(btn, 'paint-bucket');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.popover && this.popover.canvas === canvas) {
        this.popover.close();
        return;
      }
      this.openPicker(canvas, btn.getBoundingClientRect());
    });
  }
};

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

class CardColorSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    const s = this.plugin.settings;
    const save = () => this.plugin.saveSettings();
    containerEl.empty();

    new Setting(containerEl).setName('Picker').setHeading();

    new Setting(containerEl)
      .setName('Close after choosing a color')
      .setDesc('Turn off to keep the picker open while you try colors.')
      .addToggle((t) => t.setValue(s.closeOnPick).onChange(async (v) => { s.closeOnPick = v; await save(); }));

    new Setting(containerEl)
      .setName('Show theme colors')
      .setDesc("Include Obsidian's six built-in canvas colors, which follow your theme.")
      .addToggle((t) => t.setValue(s.showThemeColors).onChange(async (v) => { s.showThemeColors = v; await save(); }));

    new Setting(containerEl)
      .setName('Show recent colors')
      .addToggle((t) => t.setValue(s.showRecent).onChange(async (v) => { s.showRecent = v; await save(); }));

    new Setting(containerEl)
      .setName('Recent colors to keep')
      .addSlider((sl) =>
        sl.setLimits(0, 24, 1).setValue(s.maxRecent).setDynamicTooltip().onChange(async (v) => {
          s.maxRecent = v;
          s.recent = s.recent.slice(0, v);
          await save();
        })
      )
      .addExtraButton((b) =>
        b.setIcon('eraser').setTooltip('Clear recent colors').onClick(async () => {
          s.recent = [];
          await save();
          new Notice('Recent colors cleared');
        })
      );

    new Setting(containerEl)
      .setName('Columns')
      .addSlider((sl) =>
        sl.setLimits(4, 12, 1).setValue(s.columns).setDynamicTooltip().onChange(async (v) => { s.columns = v; await save(); })
      );

    new Setting(containerEl)
      .setName('Swatch size')
      .addSlider((sl) =>
        sl.setLimits(18, 44, 2).setValue(s.swatchSize).setDynamicTooltip().onChange(async (v) => { s.swatchSize = v; await save(); })
      );

    new Setting(containerEl)
      .setName('Palette')
      .setDesc('The first nine colors can be applied with keys 1–9 while the picker is open, or with the "Apply palette color" commands.')
      .setHeading();

    s.swatches.forEach((sw, i) => {
      new Setting(containerEl)
        .setName(i < 9 ? `${i + 1}` : '·')
        .addColorPicker((cp) =>
          cp.setValue(sw.color).onChange(async (v) => { sw.color = v; await save(); })
        )
        .addText((t) =>
          t.setPlaceholder('Name').setValue(sw.name || '').onChange(async (v) => { sw.name = v; await save(); })
        )
        .addExtraButton((b) =>
          b.setIcon('arrow-up').setTooltip('Move up').setDisabled(i === 0).onClick(async () => {
            if (i === 0) return;
            [s.swatches[i - 1], s.swatches[i]] = [s.swatches[i], s.swatches[i - 1]];
            await save();
            this.display();
          })
        )
        .addExtraButton((b) =>
          b.setIcon('arrow-down').setTooltip('Move down').setDisabled(i === s.swatches.length - 1).onClick(async () => {
            if (i === s.swatches.length - 1) return;
            [s.swatches[i + 1], s.swatches[i]] = [s.swatches[i], s.swatches[i + 1]];
            await save();
            this.display();
          })
        )
        .addExtraButton((b) =>
          b.setIcon('trash-2').setTooltip('Remove').onClick(async () => {
            s.swatches.splice(i, 1);
            await save();
            this.display();
          })
        );
    });

    new Setting(containerEl)
      .addButton((b) =>
        b.setButtonText('Add color').setCta().onClick(async () => {
          s.swatches.push({ name: '', color: '#888888' });
          await save();
          this.display();
        })
      )
      .addButton((b) =>
        b.setButtonText('Reset to defaults').setWarning().onClick(async () => {
          s.swatches = DEFAULT_SWATCHES.map((x) => ({ ...x }));
          await save();
          this.display();
        })
      );

    let importText = '';
    new Setting(containerEl)
      .setName('Import colors')
      .setDesc('Paste hex codes in any format (e.g. from Coolors or Adobe Color) to add them to the palette.')
      .addTextArea((t) => {
        t.setPlaceholder('#264653, #2a9d8f, e9c46a f4a261 #e76f51');
        t.inputEl.rows = 3;
        t.onChange((v) => (importText = v));
      })
      .addButton((b) =>
        b.setButtonText('Import').onClick(async () => {
          const matches = importText.match(/#?\b[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi) || [];
          const hexes = [...new Set(matches.map(normalizeHex).filter(Boolean))];
          if (!hexes.length) {
            new Notice('No hex colors found');
            return;
          }
          hexes.forEach((color) => s.swatches.push({ name: '', color }));
          await save();
          new Notice(`Added ${hexes.length} color${hexes.length === 1 ? '' : 's'}`);
          this.display();
        })
      );
  }
}
