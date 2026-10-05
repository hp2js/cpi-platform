import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { notFound } from '../http/api-error';
import type { AuthenticatedRequest } from './sessions';

/**
 * Routes under `institutions/:institutionId` that only that institution's own focal persons
 * may use. Anyone else gets 404, before the body is validated, so nothing leaks.
 */
@Injectable()
export class OwnInstitutionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.user?.institutionId !== request.params.institutionId)
      throw notFound();
    return true;
  }
}
