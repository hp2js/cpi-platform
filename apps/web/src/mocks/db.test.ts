// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { SCHEMA_SHAPE, SCHEMA_VERSION, schemaShape } from './db';

describe('stored demo data', () => {
  it('bumps the schema version whenever the seed changes shape', () => {
    // If this fails, stored records gained or lost fields. Browsers holding the old copy would
    // serve it to screens expecting the new shape. Increase SCHEMA_VERSION in db.ts, note the
    // change beside it, and set SCHEMA_SHAPE to the value below.
    expect(
      `${SCHEMA_VERSION}:${schemaShape()}`,
      'Increase SCHEMA_VERSION and update SCHEMA_SHAPE in db.ts',
    ).toBe(SCHEMA_SHAPE);
  });
});
