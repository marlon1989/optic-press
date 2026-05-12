import './ui/theme.js';
import './core/compressor.js';
import { injectSpeedInsights } from "@vercel/speed-insights";
import { inject } from "@vercel/analytics";

injectSpeedInsights();
inject();
