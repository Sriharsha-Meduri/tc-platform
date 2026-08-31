import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FORMS_DIR = path.join(__dirname, '../src/extractor/forms');
const PDF_DIR = '/Users/bvasireddy/apps/tc-data/form-template';
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) { console.error('GEMINI_API_KEY not set'); process.exit(1); }

const FAILED_PDFS = [
  'Broker Compensation Advisory - 6_25.pdf',
  'Buyer Homeowner_s Insurance Advisory - 6_24.pdf',
  'Fair Housing & Discrimination Advisory - 12_24.pdf',
  'Market Conditions Advisory - 6_24.pdf',
  'Seller_s Advisory - 6_25.pdf',
  'Square Foot and Lot Size Advisory - 12_24.pdf',
];

const PROMPT = `You are designing a JSON extraction template for a California Association of REALTORS® (CAR) form.

THIS IS A TEMPLATE DESIGN TASK. Do NOT extract actual values from this form.
Every leaf value must be a typed sentinel string.

SENTINELS:
  "<string | null>"               optional text field
  "<boolean>"                     checkbox or yes/no
  "<number | null>"               numeric field
  "<date: YYYY-MM-DD | null>"     date field
  ["<string>"]                    repeating array
  "<boolean — note>"              non-obvious boolean with a short note

CORRECT header example:
  "header": {
    "form_code": "<string | null>",
    "form_version": "<string | null>",
    "property_address": "<string | null>",
    "date": "<date: YYYY-MM-DD | null>"
  }

WRONG: actual values like "123 Main St", true, 850000.

For advisory forms: template = header + topic presence booleans + signatures + extractionWarnings.
Do NOT include advisory body text.

IMPORTANT: In the guidelines array, use plain text only. Do NOT use backtick characters around field names. Use single quotes around field names instead.

Return ONLY raw JSON (no markdown):
{
  "formCode": "CAR code from footer",
  "formName": "Full form name",
  "version": "vMM-YY",
  "variant": "standard",
  "template": { "header": { "form_code": "<string | null>", "form_version": "<string | null>", ... }, ... },
  "systemPromptIntro": "1-2 sentences. No backtick characters.",
  "guidelines": ["rule 1 in plain text with single quotes around field names", "rule 2", ...]
}`;

function normalizeSentinels(obj) {
  if (Array.isArray(obj)) {
    const n = obj.map(normalizeSentinels);
    if (n.every(v => typeof v === 'string' && !v.startsWith('<'))) return ['<string>'];
    return n;
  }
  if (obj !== null && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = normalizeSentinels(v);
    return out;
  }
  if (typeof obj === 'boolean') return '<boolean>';
  if (typeof obj === 'number') return '<number | null>';
  if (obj === null) return '<string | null>';
  if (typeof obj === 'string') {
    if (obj.startsWith('<')) return obj;
    if (/^\d{4}-\d{2}-\d{2}$/.test(obj)) return '<date: YYYY-MM-DD | null>';
    if (obj.length > 80) return '<string | null>';
    return '<string | null>';
  }
  return obj;
}

function escapeForTemplateLiteral(str) {
  return str.replace(/`/g, String.raw`\``).replace(/\$\{/g, String.raw`\${`);
}

function toCamelCase(formCode, variant, version) {
  const code = formCode.toLowerCase().replace(/[^a-z0-9]/g, '');
  const v = variant.charAt(0).toUpperCase() + variant.slice(1);
  const ver = 'V' + version.slice(1).replace('-', '');
  return `${code}${v}${ver}`;
}

function generateTypeScriptFile(result) {
  const { formCode, formName, version, variant, template, systemPromptIntro, guidelines } = result;
  const exportName = toCamelCase(formCode, variant, version);
  const codeId = formCode.replace(/[^A-Z0-9]/g, '_');
  const templateConst = `${codeId}_TEMPLATE`;
  const safeGuidelines = guidelines.map((g, i) => `${i + 1}. ${escapeForTemplateLiteral(g)}`).join('\n');
  const safeIntro = escapeForTemplateLiteral(systemPromptIntro);
  const safeFormName = formName.replace(/'/g, "\\'");

  if (template.header) {
    template.header.form_code = '<string | null>';
    template.header.form_version = '<string | null>';
  }
  if (!template.extractionWarnings) template.extractionWarnings = ['<string>'];

  const headerEntries = Object.entries(template.header || {})
    .filter(([k]) => k !== 'form_code' && k !== 'form_version')
    .map(([k, v]) => `    ${k}: ${JSON.stringify(v)},`)
    .join('\n');

  const bodyEntries = Object.entries(template)
    .filter(([k]) => k !== 'header')
    .map(([k, v]) => `  ${k}: ${JSON.stringify(v, null, 2).replace(/\n/g, '\n  ')},`)
    .join('\n');

  return [
    `import { FORM_FOOTER_FIELDS, FORM_FOOTER_INSTRUCTION } from '../form-definition';`,
    `import type { FormDefinition } from '../form-definition';`,
    ``,
    `const ${templateConst} = {`,
    `  header: {`,
    `    ...FORM_FOOTER_FIELDS,`,
    headerEntries,
    `  },`,
    bodyEntries,
    `};`,
    ``,
    `export const ${exportName}: FormDefinition = {`,
    `  formCode: '${formCode}',`,
    `  formName: '${safeFormName}',`,
    `  variant: '${variant}',`,
    `  version: '${version}',`,
    ``,
    `  systemPrompt: \`You are an expert California real estate transaction coordinator.`,
    safeIntro,
    ``,
    `\${FORM_FOOTER_INSTRUCTION}`,
    ``,
    `CRITICAL GUIDELINES:`,
    safeGuidelines,
    ``,
    `EXPECTED OUTPUT FORMAT:`,
    `Return ONLY valid JSON matching this template exactly. No markdown, no explanation.`,
    ``,
    `\${JSON.stringify(${templateConst}, null, 2)}\`,`,
    ``,
    `  userPrompt: 'Extract all fields from this ${safeFormName} and return valid JSON matching the template. Output ONLY valid JSON.',`,
    `};`,
    ``,
  ].join('\n');
}

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });

for (const pdf of FAILED_PDFS) {
  console.log(`Processing: ${pdf}`);
  try {
    const bytes = fs.readFileSync(path.join(PDF_DIR, pdf));
    const result = await model.generateContent([
      { inlineData: { mimeType: 'application/pdf', data: bytes.toString('base64') } },
      PROMPT,
    ]);
    const raw = result.response.text().trim()
      .replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
    const parsed = JSON.parse(raw);
    parsed.template = normalizeSentinels(parsed.template);

    console.log(`  -> ${parsed.formCode} — ${parsed.formName} (${parsed.version})`);
    const codeDir = parsed.formCode.toLowerCase().replace(/[^a-z0-9]/g, '');
    const outDir = path.join(FORMS_DIR, codeDir);
    fs.mkdirSync(outDir, { recursive: true });
    const filename = `${codeDir}.${parsed.variant}.${parsed.version}.ts`;
    fs.writeFileSync(path.join(outDir, filename), generateTypeScriptFile(parsed));
    console.log(`  -> Written: ${filename}`);
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
  }
}
