import { randomUUID } from 'crypto';

export function generateReference(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}
