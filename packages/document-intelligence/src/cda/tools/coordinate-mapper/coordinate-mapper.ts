/**
 * Browser client for the CDA coordinate mapper.
 *
 * Renders cda-template.pdf with pdf.js, lets the developer click to capture
 * field coordinates (converting CSS pixels → PDF points, including the
 * bottom-origin Y flip), edit them, and POST the result back to the server,
 * which rewrites config/cda-field-mappings.ts.
 *
 * Coordinate math:
 *   - pdf.js viewport is top-left origin, in CSS pixels (page at scale S).
 *   - pdf-lib (cda-generator) uses bottom-left origin, in PDF points.
 *   - A click at CSS (cx, cy) on a page of PDF size (W, H) at scale S maps to:
 *       pdfX = cx / S
 *       pdfY = H - cy / S
 */

import * as pdfjsLib from '/vendor/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs';

interface Coord {
  page: number;
  x: number;
  y: number;
  width?: number | null;
  height?: number | null;
  fontSize?: number | null;
  alignment?: 'left' | 'center' | 'right' | null;
  type: string;
}

type Mappings = Record<string, Coord[]>;

// ─── State ──────────────────────────────────────────────────────────────────

const FIELD_COLORS = [
  '#e11d48', '#0ea5e9', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#14b8a6',
  '#f97316', '#6366f1', '#84cc16', '#06b6d4', '#d946ef', '#22c55e', '#a855f7',
  '#ef4444',
];

let FIELDS: string[] = [];
let CUSTOM_FIELDS: string[] = [];
let DEFAULT_TYPES: Record<string, string> = {};
let mappings: Mappings = {};
let selectedField = '';

let pages: Array<{ page: number; width: number; height: number; scale: number; wrap: HTMLDivElement }> = [];
const SCALE = 1.5;

// ─── DOM refs ───────────────────────────────────────────────────────────────

const $ = (sel: string): HTMLElement => document.querySelector(sel) as HTMLElement;

const fieldSelect = $('select[name="field"]') as HTMLSelectElement;
const coordList = $('#coord-list');
const pageHost = $('#pages');
const status = $('#status');

function colorForField(name: string): string {
  const idx = FIELDS.indexOf(name);
  return FIELD_COLORS[(idx < 0 ? 0 : idx) % FIELD_COLORS.length];
}

function setStatus(msg: string, error = false): void {
  status.textContent = msg;
  status.style.color = error ? '#dc2626' : '#16a34a';
}

// ─── Data load / save ───────────────────────────────────────────────────────

async function reloadData(preferField?: string): Promise<void> {
  const res = await fetch('/api/mappings');
  const data = await res.json();
  FIELDS = data.fields;
  CUSTOM_FIELDS = data.customFields ?? [];
  DEFAULT_TYPES = data.defaultTypes;
  mappings = data.mappings;
  selectedField = preferField && FIELDS.includes(preferField) ? preferField : (FIELDS[0] ?? '');
  renderFieldSelect();
  renderCoordList();
  renderMarkers();
}

async function load(): Promise<void> {
  await reloadData();
  await renderPdf();
  renderCoordList();
  renderMarkers();
}

async function save(): Promise<void> {
  setStatus('Saving…');
  try {
    const res = await fetch('/api/mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mappings }),
    });
    const data = await res.json();
    if (data.ok) {
      setStatus(`Saved ${data.file} — typecheck ${data.typecheck.ok ? 'passed' : 'FAILED'}`);
      if (!data.typecheck.ok) {
        console.warn(data.typecheck.output);
        setStatus('Saved, but typecheck failed (see console)', true);
      }
    } else {
      setStatus(`Error: ${data.error}`, true);
    }
  } catch (e: any) {
    setStatus(`Error: ${e?.message ?? e}`, true);
  }
}

// ─── PDF rendering ──────────────────────────────────────────────────────────

async function renderPdf(): Promise<void> {
  pageHost.innerHTML = '';
  pages = [];
  const pdf = await pdfjsLib.getDocument('/template.pdf').promise;
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport }).promise;

    const wrap = document.createElement('div');
    wrap.className = 'page-wrap';
    wrap.style.width = `${viewport.width}px`;
    wrap.style.height = `${viewport.height}px`;
    wrap.dataset.page = String(i);
    wrap.appendChild(canvas);

    const label = document.createElement('div');
    label.className = 'page-label';
    label.textContent = `Page ${i}`;
    wrap.appendChild(label);

    wrap.addEventListener('click', (e) => {
      const rect = wrap.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const wPt = viewport.width / SCALE;
      const hPt = viewport.height / SCALE;
      addCoord({
        page: i,
        x: Math.round((cx / SCALE) * 100) / 100,
        y: Math.round((hPt - cy / SCALE) * 100) / 100,
        width: null,
        height: null,
        fontSize: 10,
        alignment: null,
        type: DEFAULT_TYPES[selectedField] ?? 'text',
      });
    });

    pageHost.appendChild(wrap);
    pages.push({ page: i, width: viewport.width / SCALE, height: viewport.height / SCALE, scale: SCALE, wrap });
  }
}

// ─── Markers ────────────────────────────────────────────────────────────────

function renderMarkers(): void {
  for (const p of pages) {
    p.wrap.querySelectorAll('.marker').forEach((el) => el.remove());
  }
  for (const [name, coords] of Object.entries(mappings)) {
    const color = colorForField(name);
    for (const c of coords) {
      const p = pages.find((pg) => pg.page === c.page);
      if (!p) continue;
      const marker = document.createElement('div');
      marker.className = 'marker';
      const left = c.x * p.scale;
      const top = (p.height - c.y) * p.scale;
      marker.style.left = `${left}px`;
      marker.style.top = `${top}px`;
      marker.style.borderColor = color;
      marker.style.background = color;
      marker.dataset.field = name;
      marker.title = `${name} (${c.page})`;
      const labelEl = document.createElement('span');
      labelEl.textContent = name;
      labelEl.style.background = color;
      marker.appendChild(labelEl);
      marker.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedField = name;
        fieldSelect.value = name;
        renderCoordList();
      });
      p.wrap.appendChild(marker);
    }
  }
}

// ─── Field select ───────────────────────────────────────────────────────────

function renderFieldSelect(): void {
  fieldSelect.innerHTML = '';
  for (const f of FIELDS) {
    const opt = document.createElement('option');
    opt.value = f;
    const customMark = CUSTOM_FIELDS.includes(f) ? ' *' : '';
    opt.textContent = `${f} (${(mappings[f] ?? []).length})${customMark}`;
    fieldSelect.appendChild(opt);
  }
  fieldSelect.value = selectedField;
  fieldSelect.onchange = () => {
    selectedField = fieldSelect.value;
    renderCoordList();
    updateDeleteBtn();
  };
  updateDeleteBtn();
}

function updateDeleteBtn(): void {
  const btn = $('#delete-field') as HTMLButtonElement;
  const isCustom = CUSTOM_FIELDS.includes(selectedField);
  btn.style.display = isCustom ? '' : 'none';
}

// ─── Coordinate editor ──────────────────────────────────────────────────────

function addCoord(c: Coord): void {
  if (!selectedField) {
    setStatus('Pick a field first.', true);
    return;
  }
  (mappings[selectedField] ??= []).push(c);
  renderCoordList();
  renderFieldSelect();
  renderMarkers();
  setStatus(`Added ${selectedField} @ page ${c.page} (${c.x}, ${c.y})`);
}

function updateCoord(field: string, index: number, patch: Partial<Coord>): void {
  const coords = mappings[field];
  if (!coords || !coords[index]) return;
  coords[index] = { ...coords[index], ...patch };
  renderFieldSelect();
  renderMarkers();
}

function removeCoord(field: string, index: number): void {
  mappings[field].splice(index, 1);
  renderFieldSelect();
  renderCoordList();
  renderMarkers();
}

function renderCoordList(): void {
  coordList.innerHTML = '';
  const coords = mappings[selectedField] ?? [];
  if (coords.length === 0) {
    coordList.textContent = 'No coordinates yet — click a page to add one.';
    return;
  }
  coords.forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'coord-row';

    const fieldsForRow: Array<{ key: string; label: string; value: string }> = [
      { key: 'page', label: 'page', value: String(c.page) },
      { key: 'x', label: 'x', value: String(c.x) },
      { key: 'y', label: 'y', value: String(c.y) },
      { key: 'width', label: 'w', value: c.width == null ? '' : String(c.width) },
      { key: 'height', label: 'h', value: c.height == null ? '' : String(c.height) },
      { key: 'fontSize', label: 'fs', value: c.fontSize == null ? '' : String(c.fontSize) },
    ];
    for (const f of fieldsForRow) {
      const label = document.createElement('label');
      label.textContent = f.label;
      const input = document.createElement('input');
      input.type = 'number';
      input.step = 'any';
      input.value = f.value;
      input.oninput = () => {
        const num = input.value === '' ? null : Number(input.value);
        const patch: Partial<Coord> = { [f.key]: num };
        if (f.key === 'width' || f.key === 'height') patch[f.key] = num;
        if (f.key === 'page') patch.page = num ?? 1;
        if (f.key === 'fontSize') patch.fontSize = num;
        if (f.key === 'x') patch.x = num ?? 0;
        if (f.key === 'y') patch.y = num ?? 0;
        updateCoord(selectedField, i, patch);
      };
      label.appendChild(input);
      row.appendChild(label);
    }

    const typeSel = document.createElement('select');
    typeSel.value = c.type;
    for (const t of ['text', 'currency', 'date', 'signature']) {
      const o = document.createElement('option');
      o.value = t;
      o.textContent = t;
      typeSel.appendChild(o);
    }
    typeSel.onchange = () => updateCoord(selectedField, i, { type: typeSel.value });
    row.appendChild(typeSel);

    const alignSel = document.createElement('select');
    alignSel.value = c.alignment ?? '';
    for (const a of ['', 'left', 'center', 'right']) {
      const o = document.createElement('option');
      o.value = a;
      o.textContent = a === '' ? 'align…' : a;
      alignSel.appendChild(o);
    }
    alignSel.onchange = () => updateCoord(selectedField, i, { alignment: alignSel.value === '' ? null : (alignSel.value as any) });
    row.appendChild(alignSel);

    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '×';
    del.title = 'Remove this coordinate';
    del.onclick = () => removeCoord(selectedField, i);
    row.appendChild(del);

    coordList.appendChild(row);
  });
}

// ─── Boot ───────────────────────────────────────────────────────────────────

$('#save').addEventListener('click', save);

const newFieldInput = $('#new-field') as HTMLInputElement;
const newFieldType = $('#new-field-type') as HTMLSelectElement;
$('#add-field').addEventListener('click', async () => {
  const name = newFieldInput.value.trim();
  if (!name) return;
  const type = newFieldType.value;
  newFieldInput.value = '';
  setStatus(`Adding field "${name}" (${type})…`);
  try {
    const res = await fetch('/api/fields', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type }),
    });
    const data = await res.json();
    if (data.ok) {
      await reloadData(name);
      setStatus(
        data.typecheck.ok
          ? `Field "${name}" added as ${type} — typecheck passed`
          : `Field added, but typecheck FAILED (see console)`,
        !data.typecheck.ok,
      );
    } else {
      setStatus(`Error: ${data.error}`, true);
    }
  } catch (e: any) {
    setStatus(`Error: ${e?.message ?? e}`, true);
  }
});

$('#delete-field').addEventListener('click', async () => {
  const name = selectedField;
  if (!name || !CUSTOM_FIELDS.includes(name)) return;
  if (!confirm(`Delete field "${name}" from the code? Its coordinates and type entries will be removed.`)) return;
  setStatus(`Deleting field "${name}"…`);
  try {
    const res = await fetch(`/api/fields/${encodeURIComponent(name)}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) {
      await reloadData();
      setStatus(
        data.typecheck.ok
          ? `Field "${name}" deleted — typecheck passed`
          : `Field deleted, but typecheck FAILED (see console)`,
        !data.typecheck.ok,
      );
    } else {
      setStatus(`Error: ${data.error}`, true);
    }
  } catch (e: any) {
    setStatus(`Error: ${e?.message ?? e}`, true);
  }
});

load().catch((e) => setStatus(`Load failed: ${e?.message ?? e}`, true));
