import { ValueTransformer } from 'typeorm';

/** Postgres returns bigint/int8 columns as strings; money amounts here are safely within Number.MAX_SAFE_INTEGER (minor units). */
export const BigIntTransformer: ValueTransformer = {
  to: (value?: number) => value,
  from: (value?: string) => (value === null || value === undefined ? value : parseInt(value, 10)),
};
