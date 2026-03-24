import '../src/input.css';
import './init-theme.js';
import './theme.js';
import './components.js';
import './compressor.js';
import { injectSpeedInsights } from "@vercel/speed-insights";
import { inject } from "@vercel/analytics";

injectSpeedInsights();
inject();
