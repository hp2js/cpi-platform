import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
require('reflect-metadata');
const { HealthController } = require('./dist/health.controller.js');
const { Infrastructure } = require('./dist/infrastructure.js');
assert.equal(
  Reflect.getMetadata('design:paramtypes', HealthController)[0],
  Infrastructure,
);
console.log('Nest constructor injection metadata verified');
