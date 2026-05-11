import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasTransparentPixels,
  MAX_EXACT_ALPHA_PIXELS,
} from '../src/js/workers/image-analysis.js';

test('hasTransparentPixels scans small opaque images exactly', () => {
  const context = createFakeContext({ transparentAt: null });

  assert.equal(hasTransparentPixels(context, 8, 8), false);
  assert.ok(
    context.calls.some((call) => call.width === 8 && call.height === 8),
    'Expected small images to receive an exact alpha scan',
  );
});

test('hasTransparentPixels returns true as soon as a sampled pixel has alpha', () => {
  const context = createFakeContext({ transparentAt: '0,0' });

  assert.equal(hasTransparentPixels(context, 2048, 2048), true);
  assert.deepEqual(context.calls[0], { x: 0, y: 0, width: 1, height: 1 });
  assert.equal(context.calls.length, 1);
});

test('hasTransparentPixels avoids full-canvas readbacks for large opaque images', () => {
  const side = Math.ceil(Math.sqrt(MAX_EXACT_ALPHA_PIXELS)) + 1;
  const context = createFakeContext({ transparentAt: null });

  assert.equal(hasTransparentPixels(context, side, side), true);
  assert.ok(
    context.calls.every((call) => call.width === 1 && call.height === 1),
    'Expected large images to use bounded 1x1 alpha samples only',
  );
});

/**
 * @param {{ transparentAt: string | null }} options
 */
function createFakeContext(options) {
  const calls = [];
  return {
    calls,
    getImageData(x, y, width, height) {
      calls.push({ x, y, width, height });
      const data = new Uint8ClampedArray(width * height * 4);
      data.fill(255);
      if (options.transparentAt === `${x},${y}`) data[3] = 0;
      return { data };
    },
  };
}
