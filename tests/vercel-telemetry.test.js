import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldInjectVercelTelemetry } from '../src/js/core/vercel-telemetry.js';

test('shouldInjectVercelTelemetry allows Vercel production hosts', () => {
  assert.equal(shouldInjectVercelTelemetry('optic-press.vercel.app'), true);
  assert.equal(shouldInjectVercelTelemetry('optic-press-git-main.vercel.app'), true);
  assert.equal(shouldInjectVercelTelemetry('opticpress.example'), true);
});

test('shouldInjectVercelTelemetry blocks local hosts to avoid console 404 noise', () => {
  assert.equal(shouldInjectVercelTelemetry('localhost'), false);
  assert.equal(shouldInjectVercelTelemetry('127.0.0.1'), false);
  assert.equal(shouldInjectVercelTelemetry('192.168.0.10'), false);
  assert.equal(shouldInjectVercelTelemetry('10.0.0.3'), false);
  assert.equal(shouldInjectVercelTelemetry('172.16.2.8'), false);
});

test('shouldInjectVercelTelemetry blocks empty or invalid hostnames defensively', () => {
  assert.equal(shouldInjectVercelTelemetry(''), false);
  assert.equal(shouldInjectVercelTelemetry('   '), false);
});
