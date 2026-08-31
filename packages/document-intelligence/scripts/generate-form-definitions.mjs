/**
 * Generates form definition TypeScript files for new CAR forms.
 * Usage: node scripts/generate-form-definitions.mjs
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FORMS_DIR = path.join(__dirname, '../src/extractor/forms');
const PDF_DIR = '/Users/bvasireddy/apps/tc-data/form-template';

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) { console.error('GEMINI_API_KEY not set'); process.exit(1); }

const EXISTING_PDF_PATTERNS = [
  /Agent Visual Inspection/i,
  /California Residential Purchase Agreement/i,
  /Real Estate Transfer Disclosure Statement/i,
  /Buyer_s Investigation Advisory/i,
  /Possible Representation of More than One Buyer/i,
  /Statewide Buyer and Seller Advisory/i,
];

const INSPECTION_PROMPT = `You are designing a JSON extraction template for a California Association of REALTORS® (CAR) form.

THIS IS A TEMPLATE DESIGN TASK — NOT A DATA EXTRACTION TASK.
Read the form structure and field names, but DO NOT copy any actual values, text, or data from this specific instance of the form.
Every single leaf value in your output MUST be a typed sentinel string — never an actual value.

TYPED SENTINELS — use ONLY these as leaf values:
  "<string | null>"                           — any optional text field
  "<string>"                                  — required text (rare)
  "<boolean>"                                 — any checkbox, yes/no, or signed field
  "<number | null>"                           — dollar amounts, counts, days
  "<date: YYYY-MM-DD | null>"                 — any date field
  "<'OptionA' | 'OptionB' | null>"            — field with a fixed set of choices
  ["<string>"]                                — repeating/array field (e.g. list of names)
  "<boolean — short note>"                    — non-obvious boolean needing a hint

CORRECT example of a template section:
{
  "header": {
    "form_code": "<string | null>",
    "form_version": "<string | null>",
    "property_address": "<string | null>",
    "date": "<date: YYYY-MM-DD | null>",
    "buyer_names": ["<string>"],
    "seller_names": ["<string>"]
  },
  "section_A": {
    "checkbox_field": "<boolean>",
    "amount_field": "<number | null>",
    "choice_field": "<'Option1' | 'Option2' | 'Option3' | null>",
    "text_field": "<string | null>"
  },
  "signatures": {
    "seller_signed": "<boolean>",
    "seller_date": "<date: YYYY-MM-DD | null>",
    "buyer_signed": "<boolean>",
    "buyer_date": "<date: YYYY-MM-DD | null>"
  },
  "extractionWarnings": ["<string>"]
}

WRONG — never do any of these:
  "property_address": "123 Main St"             — actual address value
  "checkbox_field": true                         — actual boolean value
  "amount_field": 850000                         — actual number value
  "note_field": "Some advisory text here..."     — advisory/description text from form body
  "section_title": "WHEN SELLERS LIST..."        — form section headings
  "description": "California law allows..."      — explanatory text

IMPORTANT RULES FOR ADVISORY FORMS:
If this form is primarily an advisory or informational document (not a data-heavy questionnaire),
keep the template SIMPLE. Advisory forms capture: which topics are covered (boolean per topic) + who signed.
Do NOT include the advisory text itself — it never changes and should not be extracted.

RETURN a single JSON object with NO markdown, ONLY raw JSON, following this exact structure:
{
  "formCode": "CAR form code from bottom-left footer (e.g. BCA, SPQ, FHDA)",
  "formName": "Full official form name as printed",
  "version": "vMM-YY from footer revision date (e.g. v06-25, v12-24)",
  "variant": "standard",
  "template": { ... use FORM_FOOTER_FIELDS pattern: always start header with form_code and form_version sentinels ... },
  "systemPromptIntro": "1-2 sentences: what this form is, who completes it, page count.",
  "guidelines": ["up to 8 specific actionable rules for LLM extraction — how checkboxes work, tricky sections, conditional logic, etc"]
}`;

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });

// Post-process: walk template and replace any non-sentinel leaf values
function normalizeSentinels(obj) {
  if (Array.isArray(obj)) {
    const normalized = obj.map(normalizeSentinels);
    // If it's an array of non-sentinel strings, collapse to ["<string>"]
    if (normalized.every(v => typeof v === 'string' && !v.startsWith('<'))) {
      return ['<string>'];
    }
    return normalized;
  }
  if (obj !== null && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = normalizeSentinels(v);
    }
    return out;
  }
  // Leaf value
  if (typeof obj === 'boolean') return '<boolean>';
  if (typeof obj === 'number') return '<number | null>';
  if (obj === null) return '<string | null>';
  if (typeof obj === 'string') {
    if (obj.startsWith('<')) return obj; // already a sentinel
    // Looks like a date (YYYY-MM-DD or M/D/YYYY)
    if (/^\d{4}-\d{2}-\d{2}$/.test(obj) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(obj)) return '<date: YYYY-MM-DD | null>';
    // Very long string = advisory/description text — remove by returning a sentinel
    if (obj.length > 80) return '<string | null>';
    // Short string that looks like actual form content (not a sentinel pattern)
    // e.g. "RPA", "Revised 12/25", a name, an address — replace with appropriate sentinel
    return '<string | null>';
  }
  return obj;
}

function toCamelCase(formCode, variant, version) {
  const code = formCode.toLowerCase().replace(/[^a-z0-9]/g, '');
  const v = variant.charAt(0).toUpperCase() + variant.slice(1);
  const ver = 'V' + version.slice(1).replace('-', '');
  return `${code}${v}${ver}`;
}

// Escape characters that break TypeScript template literals
function escapeForTemplateLiteral(str) {
  return str.replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

function generateTypeScriptFile(result) {
  const { formCode, formName, version, variant, template, systemPromptIntro, guidelines } = result;
  const exportName = toCamelCase(formCode, variant, version);
  const codeId = formCode.replace(/[^A-Z0-9]/g, '_');
  const templateConst = `${codeId}_TEMPLATE`;
  const guidelineLines = guidelines.map((g, i) => `${i + 1}. ${escapeForTemplateLiteral(g)}`).join('\n');

  // Ensure header has form_code and form_version sentinels (override any actual values)
  if (template.header) {
    template.header.form_code = '<string | null>';
    template.header.form_version = '<string | null>';
  }

  // Ensure extractionWarnings is present
  if (!template.extractionWarnings) {
    template.extractionWarnings = ['<string>'];
  }

  return `import { FORM_FOOTER_FIELDS, FORM_FOOTER_INSTRUCTION } from '../form-definition';
import type { FormDefinition } from '../form-definition';

const ${templateConst} = {
  header: {
    ...FORM_FOOTER_FIELDS,
${Object.entries(template.header || {})
  .filter(([k]) => k !== 'form_code' && k !== 'form_version')
  .map(([k, v]) => `    ${k}: ${JSON.stringify(v)},`)
  .join('\n')}
  },
${Object.entries(template)
  .filter(([k]) => k !== 'header')
  .map(([k, v]) => `  ${k}: ${JSON.stringify(v, null, 2).replace(/\n/g, '\n  ')},`)
  .join('\n')}
};

export const ${exportName}: FormDefinition = {
  formCode: '${formCode}',
  formName: '${formName.replace(/'/g, "\\'")}',
  variant: '${variant}',
  version: '${version}',

  systemPrompt: \`You are an expert California real estate transaction coordinator.
${escapeForTemplateLiteral(systemPromptIntro)}

\${FORM_FOOTER_INSTRUCTION}

CRITICAL GUIDELINES:
${guidelineLines}

EXPECTED OUTPUT FORMAT:
Return ONLY valid JSON matching this template exactly. No markdown, no explanation.

\${JSON.stringify(${templateConst}, null, 2)}\`,

  userPrompt: 'Extract all fields from this ${formName.replace(/'/g, "\\'")} and return valid JSON matching the template. Output ONLY valid JSON.',
};
`;
}

async function inspectPdf(pdfPath) {
  const bytes = fs.readFileSync(pdfPath);
  const base64 = bytes.toString('base64');

  const result = await model.generateContent([
    { inlineData: { mimeType: 'application/pdf', data: base64 } },
    INSPECTION_PROMPT,
  ]);

  const raw = result.response.text().trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '');

  const parsed = JSON.parse(raw);
  // Normalize all sentinel values
  parsed.template = normalizeSentinels(parsed.template);
  return parsed;
}

async function main() {
  const allPdfs = fs.readdirSync(PDF_DIR).filter(f => f.endsWith('.pdf'));
  const newPdfs = allPdfs.filter(f => !EXISTING_PDF_PATTERNS.some(p => p.test(f)));

  // Group FIRPTA #1 and #2 (same form, multi-page split)
  const firptaPdfs = newPdfs.filter(f => /FIRPTA/i.test(f));
  const otherPdfs = newPdfs.filter(f => !/FIRPTA/i.test(f));
  const tasks = [
    ...otherPdfs.map(f => ({ files: [f], label: f })),
    ...(firptaPdfs.length > 0 ? [{ files: firptaPdfs, label: 'FIRPTA (combined)' }] : []),
  ];

  console.log(`Processing ${tasks.length} new forms:\n`);
  tasks.forEach(t => console.log(' -', t.label));
  console.log();

  const results = [];

  for (const task of tasks) {
    console.log(`Inspecting: ${task.label}`);
    try {
      const pdfPath = path.join(PDF_DIR, task.files[0]);
      const formDef = await inspectPdf(pdfPath);

      console.log(`  → ${formDef.formCode} — ${formDef.formName} (${formDef.version})`);

      const codeDir = formDef.formCode.toLowerCase().replace(/[^a-z0-9]/g, '');
      const outDir = path.join(FORMS_DIR, codeDir);
      fs.mkdirSync(outDir, { recursive: true });

      const filename = `${codeDir}.${formDef.variant}.${formDef.version}.ts`;
      const outPath = path.join(outDir, filename);
      const tsContent = generateTypeScriptFile(formDef);
      fs.writeFileSync(outPath, tsContent);
      console.log(`  → Written: src/extractor/forms/${codeDir}/${filename}`);

      results.push({
        formCode: formDef.formCode,
        codeDir,
        exportName: toCamelCase(formDef.formCode, formDef.variant, formDef.version),
        version: formDef.version,
        variant: formDef.variant,
      });
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
      if (err.message.includes('JSON')) {
        console.error('  (Gemini returned non-JSON — try again)');
      }
    }
  }

  // Print registry snippet
  if (results.length > 0) {
    console.log('\n\n=== registry.ts imports ===');
    for (const r of results) {
      const fn = `${r.codeDir}.${r.variant}.${r.version}`;
      console.log(`import { ${r.exportName} } from './${r.codeDir}/${fn}';`);
    }
    console.log('\n=== FORM_REGISTRY entries ===');
    for (const r of results) {
      console.log(`  '${r.formCode}':              ${r.exportName},`);
      console.log(`  '${r.formCode}@${r.version}': ${r.exportName},`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
