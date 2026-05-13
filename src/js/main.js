import './ui/theme.js';
import './core/compressor.js';
import { injectSpeedInsights } from "@vercel/speed-insights";
import { inject } from "@vercel/analytics";
import { shouldInjectVercelTelemetry } from './core/vercel-telemetry.js';

if (shouldInjectVercelTelemetry(window.location.hostname)) {
  injectSpeedInsights();
  inject();
}
