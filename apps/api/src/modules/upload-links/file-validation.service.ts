import { Injectable } from '@nestjs/common';
import * as path from 'path';
import { AllowedFileConfig } from './upload-link.types';

export type FileValidationResult =
  | { valid: true; sanitizedFileName: string }
  | { valid: false; reason: string };

@Injectable()
export class FileValidationService {
  /**
   * Validates one uploaded file against the allow-list config. This is an
   * allow-list (not a deny-list) on mime type, so unrecognized and executable
   * content is rejected by default rather than requiring an ever-growing
   * blocklist.
   */
  validateFile(file: Express.Multer.File, config: AllowedFileConfig): FileValidationResult {
    if (!file || !file.buffer || file.size === 0) {
      return { valid: false, reason: 'File is empty.' };
    }

    if (file.size > config.maxFileSizeBytes) {
      const maxMb = Math.round(config.maxFileSizeBytes / (1024 * 1024));
      return { valid: false, reason: `File exceeds the ${maxMb}MB size limit.` };
    }

    if (!config.allowedMimeTypes.includes(file.mimetype)) {
      return { valid: false, reason: `File type "${file.mimetype || 'unknown'}" is not supported.` };
    }

    const sanitizedFileName = this.sanitizeFileName(file.originalname);
    if (!sanitizedFileName) {
      return { valid: false, reason: 'Filename is invalid.' };
    }

    return { valid: true, sanitizedFileName };
  }

  /** Same safe-filename convention as S3StorageService.buildKey, applied here so a rejection surfaces before storage is attempted. */
  private sanitizeFileName(originalName: string): string {
    return path
      .basename(originalName)
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .toLowerCase();
  }
}
