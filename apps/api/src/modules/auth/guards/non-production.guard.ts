import { Injectable, CanActivate, ForbiddenException } from '@nestjs/common';

/**
 * Defense-in-depth for routes that must never run in production, even if
 * their owning module were ever accidentally registered unconditionally.
 * The primary gate is still module-level: register the module only via
 * `...(process.env.APP_ENV !== 'production' ? [SomeModule] : [])` in
 * app.module.ts (see AdminTestingModule) — this guard is the belt to that
 * suspenders, not a substitute for it.
 */
@Injectable()
export class NonProductionGuard implements CanActivate {
  canActivate(): boolean {
    if (process.env.APP_ENV === 'production') {
      throw new ForbiddenException('This endpoint is not available in production.');
    }
    return true;
  }
}
