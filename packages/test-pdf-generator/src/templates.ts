import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

const FORM_TEMPLATE_MAP: Record<string, string> = {
  RPA: 'California-Residential-Purchase-Agreement.pdf',
  TDS: 'Real Estate Transfer Disclosure Statement #1 - 6_24.pdf',
  SPQ: 'Seller Property Questionnaire #1 - 12_25.pdf',
  AVID: 'Agent Visual Inspection Disclosure #1 - 6_24.pdf',
  BIA: 'Buyer_s Investigation Advisory - 6_25.pdf',
};

function templateDir(): string {
  return path.join(__dirname, '..', 'templates');
}

function longName(code: string): string {
  return FORM_TEMPLATE_MAP[code] || code + '.pdf';
}

function decryptWithQpdf(encryptedPath: string, decryptedPath: string): boolean {
  try {
    execSync(
      `qpdf --decrypt ${JSON.stringify(encryptedPath)} ${JSON.stringify(decryptedPath)}`,
      { stdio: 'pipe', timeout: 30000 },
    );
    return fs.existsSync(decryptedPath);
  } catch (e: any) {
    // qpdf exit code 3 = warnings, file is still valid
    if (e.status && e.status > 3) return false;
    return fs.existsSync(decryptedPath);
  }
}

export function resolveTemplatePath(formCode: string, state = 'ca'): string {
  const code = formCode.toUpperCase();
  const dir = path.join(templateDir(), state.toLowerCase());

  // 1. Check for already-decrypted version
  const decryptedPath = path.join(dir, code + '-decrypted.pdf');
  if (fs.existsSync(decryptedPath)) return decryptedPath;

  // 2. Check for encrypted version and auto-decrypt
  const encryptedPaths = [
    path.join(dir, code + '.pdf'),
    path.join(dir, longName(code)),
  ];
  if (process.env.TC_DATA_PATH) {
    encryptedPaths.push(
      path.join(process.env.TC_DATA_PATH, 'form-template', state.toLowerCase(), longName(code)),
    );
  }

  for (const ep of encryptedPaths) {
    if (fs.existsSync(ep)) {
      if (decryptWithQpdf(ep, decryptedPath)) {
        return decryptedPath;
      }
      return ep; // fallback: return encrypted, caller may handle
    }
  }

  throw new Error(
    `Blank template not found for ${code} (state: ${state}). Tried:\n` +
      `  ${decryptedPath}\n` +
      encryptedPaths.map((p) => `  ${p}`).join('\n'),
  );
}
