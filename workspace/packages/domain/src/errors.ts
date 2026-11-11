/** Domain errors mapped to HTTP by apps/web. Cross-tenant access is always NotFound (404). */
export class DomainError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409 | 422,
    readonly code: string,
    message: string,
    readonly fields: string[] = [],
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}
export const notFound = (what: string) => new DomainError(404, 'not_found', `${what} not found`);
export const forbidden = (message = 'not permitted for this role') => new DomainError(403, 'forbidden', message);
export const conflict = (code: string, message: string, details: Record<string, unknown> = {}) => new DomainError(409, code, message, [], details);
export const unprocessable = (message: string, fields: string[]) => new DomainError(422, 'unprocessable', message, fields);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Identifiers are validated before any query (B1-007): malformed ids are 422, not 500. */
export function uuidField(v: unknown, field: string): string {
  if (typeof v !== 'string' || !UUID.test(v)) throw unprocessable(`${field} must be a UUID`, [field]);
  return v.toLowerCase();
}
