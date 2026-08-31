/**
 * Standalone DocuSign connection + envelope test.
 *
 * Usage:
 *   cd apps/api
 *   node scripts/test-docusign.mjs [recipient-email]
 *
 * Falls back to reading env vars from apps/api/.env.local via dotenv.
 * Requires: node 20+ (uses Web Crypto for RSA signing).
 */

import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

// PDFs from document-intelligence test fixtures
const PDF_DIR = resolve(REPO_ROOT, 'packages', 'document-intelligence', 'test', 'extraction', 'raymond-home');
const PDF_FILES = [
  { name: 'rpa-raymond.pdf', label: 'RPA - Residential Purchase Agreement' },
  { name: 'sco-raymond.pdf', label: 'SCO - Seller Counter Offer' },
  { name: 'bco1-raymond.pdf', label: 'BCO - Buyer Counter Offer' },
];

// ── Load .env.local ─────────────────────────────────────────────────────────

function loadEnv() {
  try {
    const envPath = resolve(__dirname, '..', '.env.local');
    const content = readFileSync(envPath, 'utf-8');
    const lines = content.split('\n');
    let currentKey = null;
    let currentVal = '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      // Multi-line continuation (key already started, no = on this line)
      if (currentKey && !trimmed.includes('=')) {
        currentVal += '\n' + trimmed;
        continue;
      }
      // Flush previous key if starting a new one
      if (currentKey) {
        process.env[currentKey] = currentVal;
        currentKey = null;
        currentVal = '';
      }
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      currentKey = trimmed.slice(0, eqIdx).trim();
      currentVal = trimmed.slice(eqIdx + 1).trim();
    }
    if (currentKey) process.env[currentKey] = currentVal;
  } catch (e) {
    console.error('Could not load .env.local — make sure API env vars are set.', e.message);
    process.exit(1);
  }
}

loadEnv();

const INTEGRATION_KEY = process.env.DOCUSIGN_INTEGRATION_KEY;
const IMPERSONATED_USER_ID = process.env.DOCUSIGN_IMPERSONATED_USER_ID;
const ACCOUNT_ID = process.env.DOCUSIGN_ACCOUNT_ID;
const PRIVATE_KEY = process.env.DOCUSIGN_PRIVATE_KEY;
const AUTH_SERVER = process.env.DOCUSIGN_AUTH_SERVER || 'account-d.docusign.com';

if (!INTEGRATION_KEY || !IMPERSONATED_USER_ID || !ACCOUNT_ID || !PRIVATE_KEY) {
  console.error('Missing DocuSign env vars. Check DOCUSIGN_INTEGRATION_KEY, IMPERSONATED_USER_ID, ACCOUNT_ID, PRIVATE_KEY.');
  process.exit(1);
}

// ── JWT sign helper (Node crypto) ──────────────────────────────────────────

function getPrivateKeyPem() {
  let key = PRIVATE_KEY;
  if (!key.includes('-----BEGIN')) {
    key = Buffer.from(key, 'base64').toString('utf-8');
  }
  // Reconstruct proper PEM with newlines
  const body = key.replace(/-----(BEGIN|END) [^-]+-----/g, '').replace(/\s/g, '');
  const hdrMatch = key.match(/-----BEGIN [^-]+-----/);
  const ftrMatch = key.match(/-----END [^-]+-----/);
  if (hdrMatch && ftrMatch) {
    const header = hdrMatch[0];
    const footer = ftrMatch[0];
    const bodyLines = body.match(/.{1,64}/g) || [];
    return [header, ...bodyLines, footer].join('\n');
  }
  return key;
}

function signJwt(payload) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const enc = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const signingInput = `${enc(header)}.${enc(payload)}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  sign.end();
  const signature = sign.sign(getPrivateKeyPem(), 'base64url');
  return `${signingInput}.${signature}`;
}

// ── Main ───────────────────────────────────────────────────────────────────

const EMAIL = process.argv[2] || 'ashok.morepatil@gmail.com';
const NAME = process.argv[3] || 'Ashok Morepatil';

console.log(`\n📄 DocuSign Connection Test`);
console.log(`   Recipient: ${EMAIL}`);
console.log(`   Auth Server: ${AUTH_SERVER}\n`);

// Step 1 — Get OAuth token
console.log('1️⃣  Authenticating via JWT Grant...');

const now = Math.floor(Date.now() / 1000);
const assertion = signJwt({
  iss: INTEGRATION_KEY,
  sub: IMPERSONATED_USER_ID,
  aud: AUTH_SERVER,
  iat: now,
  exp: now + 3600,
  scope: 'signature impersonation',
});

const tokenRes = await fetch(`https://${AUTH_SERVER}/oauth/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  }),
});

if (!tokenRes.ok) {
  const err = await tokenRes.text();
  // DocuSign returns consent_required on first JWT grant attempt
  if (err.includes('consent_required')) {
    const consentUrl = `https://${AUTH_SERVER}/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=${INTEGRATION_KEY}&redirect_uri=https://www.docusign.com`;
    console.error(`❌ Consent required. Grant consent once by opening this URL in a browser:\n`);
    console.error(`   ${consentUrl}\n`);
    console.error(`   After granting consent, re-run this script.\n`);
    process.exit(1);
  }
  console.error(`❌ Auth failed (${tokenRes.status}): ${err}`);
  process.exit(1);
}

const { access_token } = await tokenRes.json();
console.log('   ✅ Access token obtained');

// Step 2 — Get user info (base URI)
console.log('2️⃣  Fetching account info...');

const userRes = await fetch(`https://${AUTH_SERVER}/oauth/userinfo`, {
  headers: { Authorization: `Bearer ${access_token}` },
});

if (!userRes.ok) {
  console.error(`❌ User info fetch failed (${userRes.status})`);
  process.exit(1);
}

const { accounts } = await userRes.json();
const account = accounts.find((a) => a.account_id === ACCOUNT_ID) || accounts[0];
const baseUri = account.base_uri;
console.log(`   ✅ Base URI: ${baseUri}`);

// Step 3 — Load PDFs and create envelope
console.log('3️⃣  Loading PDFs from raymond-home...');

const documents = [];
let docIdx = 1;
for (const { name, label } of PDF_FILES) {
  const filePath = resolve(PDF_DIR, name);
  try {
    const buffer = readFileSync(filePath);
    documents.push({
      documentBase64: buffer.toString('base64'),
      name: label.replace(/[^a-zA-Z0-9 -]/g, '') + '.pdf',
      documentId: String(docIdx),
      fileExtension: 'pdf',
    });
    console.log(`   ✅ ${name} (${(buffer.length / 1024).toFixed(1)} KB)`);
    docIdx++;
  } catch (e) {
    console.error(`   ⚠️  Could not read ${name}: ${e.message}`);
  }
}

if (documents.length === 0) {
  console.error('❌ No PDFs loaded.');
  process.exit(1);
}

// Step 4 — Create + send envelope
console.log(`4️⃣  Creating envelope with ${documents.length} document(s)...`);

const envApiUrl = `${baseUri}/restapi/v2.1/accounts/${ACCOUNT_ID}/envelopes`;

const envelopeBody = {
  emailSubject: 'Signature Request — Raymond Home (RPA / SCO / BCO)',
  emailBlurb: 'Please review and sign the attached real estate documents.',
  status: 'sent',
  documents,
  recipients: {
    signers: [
      {
        email: EMAIL,
        name: NAME,
        recipientId: '1',
        routingOrder: '1',
      },
    ],
  },
};

const envRes = await fetch(envApiUrl, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${access_token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(envelopeBody),
});

if (!envRes.ok) {
  const err = await envRes.text();
  console.error(`❌ Envelope creation failed (${envRes.status}): ${err}`);
  process.exit(1);
}

const envelope = await envRes.json();
console.log('   ✅ Envelope created!');
console.log(`\n   ┌──────────────────────────────────────────────────┐`);
console.log(`   │  Envelope ID : ${envelope.envelopeId.padEnd(36)}│`);
console.log(`   │  Status      : ${envelope.status.padEnd(36)}│`);
console.log(`   │  URI         : ${envelope.uri.padEnd(36)}│`);
console.log(`   └──────────────────────────────────────────────────┘`);

// Step 4 — Get recipient view URL
console.log('\n4️⃣  Fetching signing URL...');

const viewRes = await fetch(`${envApiUrl}/${envelope.envelopeId}/views/recipient`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${access_token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    returnUrl: process.env.WEB_APP_URL || 'http://localhost:3001',
    authenticationMethod: 'email',
    email: EMAIL,
    userName: NAME,
    recipientId: '1',
  }),
});

if (viewRes.ok) {
  const { url } = await viewRes.json();
  console.log(`   ✅ Signing URL:\n   ${url}\n`);
} else {
  console.log('   ⚠️  Could not fetch signing URL (envelope may need email activation first)\n');
}

console.log(`\n✅ Envelope sent to ${EMAIL} with ${documents.length} document(s). Check your inbox.\n`);
