import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
// hbs exposes the underlying Handlebars instance it was initialised with.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Handlebars: typeof import('handlebars') = require('hbs').handlebars;

type TemplateFn = (ctx: Record<string, unknown>) => string;

@Injectable()
export class EmailTemplateService {
  private readonly logger = new Logger(EmailTemplateService.name);

  /**
   * Compiled template cache — templates are read from disk once and kept in
   * memory for the lifetime of the process.  To update a template, restart
   * the API (no hot-reload needed for production; `nest start --watch` will
   * auto-restart on file saves).
   */
  private readonly cache = new Map<string, TemplateFn>();

  /**
   * Renders a Handlebars template from `views/emails/<name>`.
   *
   * @param name    Filename inside `views/emails/`, e.g. `transaction-welcome.html.hbs`
   * @param context Variables available inside the template (e.g. `{ name, role, address, txNumber }`)
   */
  render(name: string, context: Record<string, unknown>): string {
    if (!this.cache.has(name)) {
      // Works for both ts-node dev (__dirname = src/modules/auth) and compiled
      // prod (__dirname = dist/modules/auth) because views/ sits one level above src/.
      const filePath = join(__dirname, '..', '..', '..', 'views', 'emails', name);
      this.logger.debug(`Loading email template: ${filePath}`);
      const source = readFileSync(filePath, 'utf-8');
      this.cache.set(name, Handlebars.compile(source));
    }
    return this.cache.get(name)!(context);
  }
}
