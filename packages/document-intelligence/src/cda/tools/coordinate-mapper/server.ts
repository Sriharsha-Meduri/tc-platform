/**
 * Dev-only HTTP server for the CDA coordinate mapper.
 *
 * Serves the browser tool (index.html + coordinate-mapper.ts transpiled to
 * JS), the CDA template PDF, pdf.js assets from node_modules, and a small
 * API that reads/writes config/cda-field-mappings.ts.
 *
 * Run (from packages/document-intelligence):
 *   node src/cda/tools/coordinate-mapper/server.ts
 *
 * Then open http://127.0.0.1:8787
 *
 * This server is a temporary development tool. It binds to 127.0.0.1 only
 * and must never be deployed or exposed in production.
 */

import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Paths ──────────────────────────────────────────────────────────────────

const TOOL_DIR = __dirname;
const CDA_DIR = path.resolve(TOOL_DIR, '../..');
const PKG_DIR = path.resolve(CDA_DIR, '../..');
const MAPPINGS_FILE = path.join(CDA_DIR, 'config', 'cda-field-mappings.ts');
const TEMPLATE_FILE = path.join(CDA_DIR, 'templates', 'cda-template.pdf');
const INDEX_HTML = path.join(TOOL_DIR, 'index.html');
const CLIENT_TS = path.join(TOOL_DIR, 'coordinate-mapper.ts');
const PDFJS_BUILD = path.join(PKG_DIR, 'node_modules', 'pdfjs-dist', 'build');
const PDFJS_MAIN = path.join(PDFJS_BUILD, 'pdf.min.mjs');
const PDFJS_WORKER = path.join(PDFJS_BUILD, 'pdf.worker.min.mjs');
const TYPES_FILE = path.join(CDA_DIR, 'types', 'cda.types.ts');
const FIELD_TYPES_FILE = path.join(TOOL_DIR, 'field-types.json');

const PORT = Number(process.env.CDA_MAPPER_PORT ?? 8787);
const HOST = '127.0.0.1';

// ─── Canonical field vocabulary (mirrors src/cda/types/cda.types.ts) ───────

export const CANONICAL_FIELDS: readonly string[] = [
  'brokerage',
  'brokerName',
  'agent',
  'escrowNumber',
  'salePrice',
  'closeOfEscrowDate',
  'clientCredits',
  'totalCommissionToDisburse',
  'brokerageAddress',
  'agentAddress',
  'brokerCommissionAmount',
  'agentCommissionAmount',
  'mytcAppCommissionAmount',
  'brokerSignature',
  'date',
];

export const DEFAULT_TYPES: Record<string, string> = {
  brokerage: 'text',
  brokerName: 'text',
  agent: 'text',
  escrowNumber: 'text',
  salePrice: 'currency',
  closeOfEscrowDate: 'date',
  clientCredits: 'currency',
  totalCommissionToDisburse: 'currency',
  brokerageAddress: 'text',
  agentAddress: 'text',
  brokerCommissionAmount: 'currency',
  agentCommissionAmount: 'currency',
  mytcAppCommissionAmount: 'currency',
  brokerSignature: 'signature',
  date: 'date',
};

const ALLOWED_TYPES = new Set(['text', 'currency', 'date', 'signature']);
const ALLOWED_ALIGNMENTS = new Set(['left', 'center', 'right']);

// ─── Custom fields (names derived from the mappings file; their default
//     PDF type remembered in this tool's own field-types.json so it survives
//     a restart without ever being required for the code to build) ──────────

function customFieldsFrom(mappings: Mappings): string[] {
  return Object.keys(mappings).filter((f) => !CANONICAL_FIELDS.includes(f));
}

function loadCustomTypes(): Record<string, string> {
  try {
    if (!fs.existsSync(FIELD_TYPES_FILE)) return {};
    const parsed = JSON.parse(fs.readFileSync(FIELD_TYPES_FILE, 'utf8'));
    const out: Record<string, string> = {};
    for (const [name, t] of Object.entries(parsed?.types ?? {})) {
      if (ALLOWED_TYPES.has(String(t))) out[name] = String(t);
    }
    return out;
  } catch {
    return {};
  }
}

function saveCustomType(name: string, type: string): void {
  const types = loadCustomTypes();
  types[name] = type;
  fs.writeFileSync(FIELD_TYPES_FILE, JSON.stringify({ types }, null, 2) + '\n', 'utf8');
}

function clearCustomType(name: string): void {
  const types = loadCustomTypes();
  if (!(name in types)) return;
  delete types[name];
  fs.writeFileSync(FIELD_TYPES_FILE, JSON.stringify({ types }, null, 2) + '\n', 'utf8');
}

function defaultTypesFor(fields: string[]): Record<string, string> {
  const customTypes = loadCustomTypes();
  const out: Record<string, string> = {};
  for (const f of fields) out[f] = customTypes[f] ?? DEFAULT_TYPES[f] ?? 'text';
  return out;
}

/**
 * The TS property type a custom field gets in cda.types.ts, derived from the
 * PDF type the developer chose when creating the field:
 *   text      → string                    (input & resolved)
 *   currency  → number                    (input & resolved)
 *   date      → Date|string (input), string (resolved, already formatted)
 *   signature → Buffer|string             (input & resolved)
 */
function propertyLinesFor(name: string, type: string): { input: string; resolved: string } {
  switch (type) {
    case 'currency':
      return { input: `  ${name}?: number | null;`, resolved: `  ${name}?: number | null;` };
    case 'date':
      return { input: `  ${name}?: Date | string | null;`, resolved: `  ${name}?: string | null;` };
    case 'signature':
      return { input: `  ${name}?: Buffer | string | null;`, resolved: `  ${name}?: Buffer | string | null;` };
    default:
      return { input: `  ${name}?: string | null;`, resolved: `  ${name}?: string | null;` };
  }
}

/**
 * Registers (or unregisters) a custom field in src/cda/types/cda.types.ts:
 * adds/removes the name in the CdaFieldName union and as an optional,
 * type-appropriate property on both CdaGenerationInput and
 * ResolvedCdaValues, so the package stays typecheck-clean with the field
 * present. Throws if an anchor can't be found — all anchors are validated up
 * front so a failure never leaves the file half-edited.
 */
function patchTypesFile(name: string, op: 'add' | 'remove', type = 'text'): void {
  const src = fs.readFileSync(TYPES_FILE, 'utf8');
  const unionLine = `  | '${name}'`;
  // Anchors are the stable canonical `date` lines (never removed by this
  // tool). New custom properties are inserted AFTER them, so adding a second
  // field works even though earlier fields already sit before the closing `}`.
  const unionAnchor = `  | 'date';`;
  const resolvedAnchor = `  date: string;`;
  const inputAnchor = `  date?: Date | string | null;`;

  if (op === 'add') {
    if (src.includes(unionLine)) throw new Error(`field "${name}" already exists in cda.types.ts`);
    if (!src.includes(unionAnchor) || !src.includes(resolvedAnchor) || !src.includes(inputAnchor)) {
      throw new Error('could not find the cda.types.ts anchors needed to register the field');
    }
    const { input, resolved } = propertyLinesFor(name, type);
    fs.writeFileSync(
      TYPES_FILE,
      src
        .replace(unionAnchor, `${unionLine}\n${unionAnchor}`)
        .replace(resolvedAnchor, `${resolvedAnchor}\n${resolved}`)
        .replace(inputAnchor, `${inputAnchor}\n${input}`),
      'utf8',
    );
  } else {
    // Names are validated identifiers ([A-Za-z][A-Za-z0-9_]*), so plain
    // literal regexes are safe here. The property regex covers every typed
    // variant ('?: string | number | Date | Buffer ... null;').
    const unionRe = new RegExp(`\n  \\| '${name}'`);
    const propRe = new RegExp(`\n  ${name}\\?: .*;`, 'g');
    fs.writeFileSync(TYPES_FILE, src.replace(unionRe, '').replace(propRe, ''), 'utf8');
  }
}

// ─── Mappings read / write ──────────────────────────────────────────────────

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

async function readMappings(): Promise<Mappings> {
  const mod = await import(pathToFileURL(MAPPINGS_FILE).href + `?t=${Date.now()}`);
  return mod.CDA_FIELD_MAPPINGS as Mappings;
}

function fmtNum(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 100) / 100);
}

function coordToSource(c: Coord): string {
  const parts: string[] = [`page: ${c.page}`, `x: ${fmtNum(c.x)}`, `y: ${fmtNum(c.y)}`];
  if (c.width != null) parts.push(`width: ${fmtNum(c.width)}`);
  if (c.height != null) parts.push(`height: ${fmtNum(c.height)}`);
  if (c.fontSize != null) parts.push(`fontSize: ${fmtNum(c.fontSize)}`);
  if (c.alignment) parts.push(`alignment: '${c.alignment}'`);
  parts.push(`type: '${c.type ?? 'text'}'`);
  return `{ ${parts.join(', ')} }`;
}

/**
 * Regenerates cda-field-mappings.ts, preserving the original header comment
 * and import line, and replacing only the mapping object body.
 */
function buildMappingsFileSource(mappings: Mappings): string {
  const current = fs.readFileSync(MAPPINGS_FILE, 'utf8');
  const splitAt = 'export const CDA_FIELD_MAPPINGS: CdaFieldMapping = {';
  const header = current.includes(splitAt)
    ? current.slice(0, current.indexOf(splitAt))
    : `import type { CdaFieldMapping } from '../types/cda.types';\n\n`;

  const body = [...CANONICAL_FIELDS, ...customFieldsFrom(mappings)].map((name) => {
    const coords = mappings[name] ?? [];
    if (coords.length === 0) return `  ${name}: [],`;
    return `  ${name}: [\n${coords.map((c) => `    ${coordToSource(c)},`).join('\n')}\n  ],`;
  }).join('\n');

  return `${header}export const CDA_FIELD_MAPPINGS: CdaFieldMapping = {\n${body}\n};\n`;
}

function validateMappings(raw: unknown, knownFields: string[]): Mappings {
  if (typeof raw !== 'object' || raw === null) throw new Error('body must be a JSON object');
  const input = raw as Record<string, unknown>;

  for (const name of Object.keys(input)) {
    if (!knownFields.includes(name)) {
      throw new Error(`unknown field "${name}" — create it with POST /api/fields first.`);
    }
  }

  const out: Mappings = {};
  for (const name of knownFields) {
    const value = input[name];
    const coords: Coord[] = [];
    if (value != null) {
      if (!Array.isArray(value)) throw new Error(`field "${name}" must be an array`);
      for (const item of value) {
        if (typeof item !== 'object' || item === null) throw new Error(`coordinate in "${name}" must be an object`);
        const c = item as Record<string, unknown>;
        if (typeof c.page !== 'number' || !Number.isInteger(c.page) || c.page < 1) {
          throw new Error(`coordinate in "${name}" has an invalid page: ${c.page}`);
        }
        if (typeof c.x !== 'number' || !Number.isFinite(c.x)) throw new Error(`coordinate in "${name}" has an invalid x: ${c.x}`);
        if (typeof c.y !== 'number' || !Number.isFinite(c.y)) throw new Error(`coordinate in "${name}" has an invalid y: ${c.y}`);
        const type = typeof c.type === 'string' ? c.type : 'text';
        if (!ALLOWED_TYPES.has(type)) throw new Error(`coordinate in "${name}" has an invalid type: ${type}`);
        if (c.alignment != null && !ALLOWED_ALIGNMENTS.has(c.alignment as string)) {
          throw new Error(`coordinate in "${name}" has an invalid alignment: ${c.alignment}`);
        }
        for (const num of ['width', 'height', 'fontSize'] as const) {
          if (c[num] != null && (typeof c[num] !== 'number' || !Number.isFinite(c[num] as number))) {
            throw new Error(`coordinate in "${name}" has an invalid ${num}: ${c[num]}`);
          }
        }
        coords.push({
          page: c.page,
          x: c.x,
          y: c.y,
          width: typeof c.width === 'number' ? c.width : null,
          height: typeof c.height === 'number' ? c.height : null,
          fontSize: typeof c.fontSize === 'number' ? c.fontSize : null,
          alignment: (typeof c.alignment === 'string' ? c.alignment : null) as 'left' | 'center' | 'right' | null,
          type,
        });
      }
    }
    out[name] = coords;
  }
  return out;
}

function typecheckMappingsFile(): { ok: boolean; output: string } {
  const tscBin = path.join(PKG_DIR, 'node_modules', '.bin', 'tsc');
  try {
    const out = execFileSync(tscBin, ['--noEmit'], { cwd: PKG_DIR, encoding: 'utf8', timeout: 60_000 });
    return { ok: true, output: out };
  } catch (e: any) {
    return { ok: false, output: String(e?.stdout ?? e?.message ?? e) };
  }
}

// ─── Static serving ─────────────────────────────────────────────────────────

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.pdf': 'application/pdf',
};

function serveFile(res: http.ServerResponse, file: string, fallback = false): void {
  if (!fs.existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(`404: ${file}`);
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

function serveClientJs(res: http.ServerResponse): void {
  const src = fs.readFileSync(CLIENT_TS, 'utf8');
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      esModuleInterop: true,
    },
  });
  res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
  res.end(outputText);
}

// ─── Server ─────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);
  const pathname = url.pathname;

  try {
    if (req.method === 'GET' && pathname === '/') {
      return serveFile(res, INDEX_HTML);
    }
    if (req.method === 'GET' && pathname === '/coordinate-mapper.js') {
      return serveClientJs(res);
    }
    if (req.method === 'GET' && pathname === '/template.pdf') {
      return serveFile(res, TEMPLATE_FILE);
    }
    if (req.method === 'GET' && pathname === '/vendor/pdf.min.mjs') {
      return serveFile(res, PDFJS_MAIN);
    }
    if (req.method === 'GET' && pathname === '/vendor/pdf.worker.min.mjs') {
      return serveFile(res, PDFJS_WORKER);
    }

    if (pathname === '/api/mappings') {
      if (req.method === 'GET') {
        const mappings = await readMappings();
        const fields = [...CANONICAL_FIELDS, ...customFieldsFrom(mappings)];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(
          JSON.stringify({
            fields,
            customFields: customFieldsFrom(mappings),
            defaultTypes: defaultTypesFor(fields),
            mappings,
          }),
        );
      }
      if (req.method === 'POST') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const parsed = JSON.parse(body);
        const current = await readMappings();
        const knownFields = [...CANONICAL_FIELDS, ...customFieldsFrom(current)];
        const mappings = validateMappings(parsed.mappings ?? parsed, knownFields);
        fs.writeFileSync(MAPPINGS_FILE, buildMappingsFileSource(mappings), 'utf8');
        const tc = typecheckMappingsFile();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(
          JSON.stringify({
            ok: true,
            written: true,
            file: path.relative(process.cwd(), MAPPINGS_FILE),
            typecheck: tc,
          }),
        );
      }
    }

    if (pathname === '/api/fields' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const parsed = JSON.parse(body);
      const name = typeof parsed?.name === 'string' ? parsed.name.trim() : '';
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name) || name.length > 64) {
        throw new Error(
          `Invalid field name "${name}" — must start with a letter and contain only letters, digits, or underscores (max 64 chars).`,
        );
      }
      const type = typeof parsed?.type === 'string' ? parsed.type : 'text';
      if (!ALLOWED_TYPES.has(type)) {
        throw new Error(`Invalid type "${type}" — must be one of: ${[...ALLOWED_TYPES].join(', ')}.`);
      }
      const current = await readMappings();
      const knownFields = [...CANONICAL_FIELDS, ...customFieldsFrom(current)];
      if (knownFields.includes(name)) throw new Error(`Field "${name}" already exists.`);
      patchTypesFile(name, 'add', type);
      saveCustomType(name, type);
      fs.writeFileSync(MAPPINGS_FILE, buildMappingsFileSource({ ...current, [name]: [] }), 'utf8');
      const tc = typecheckMappingsFile();
      const after = customFieldsFrom({ ...current, [name]: [] });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(
        JSON.stringify({ ok: true, name, fields: [...CANONICAL_FIELDS, ...after], customFields: after, typecheck: tc }),
      );
    }

    const fieldDelete = pathname.match(/^\/api\/fields\/([^/]+)$/);
    if (fieldDelete && req.method === 'DELETE') {
      const name = decodeURIComponent(fieldDelete[1]);
      const current = await readMappings();
      const custom = customFieldsFrom(current);
      if (!custom.includes(name)) throw new Error(`"${name}" is not a custom field — it cannot be deleted.`);
      patchTypesFile(name, 'remove');
      clearCustomType(name);
      delete (current as Record<string, Coord[]>)[name];
      fs.writeFileSync(MAPPINGS_FILE, buildMappingsFileSource(current), 'utf8');
      const tc = typecheckMappingsFile();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(
        JSON.stringify({
          ok: true,
          name,
          fields: [...CANONICAL_FIELDS, ...customFieldsFrom(current)],
          customFields: customFieldsFrom(current),
          typecheck: tc,
        }),
      );
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404: not found');
  } catch (e: any) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: String(e?.message ?? e) }));
  }
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  CDA coordinate mapper — dev tool');
  console.log(`  Open: http://${HOST}:${PORT}`);
  console.log(`  Writes: ${MAPPINGS_FILE}`);
  console.log('  Bind: 127.0.0.1 only — never expose in production.');
  console.log('');
});
