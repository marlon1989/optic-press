# OpticPress

OpticPress is a private, browser-based image optimizer with a lightweight `lume.` interface. Images are processed locally in the user's browser, with compression work moved to Web Workers so the page stays responsive during batches.

## What It Does

- Accepts WEBP, PNG, JPEG, AVIF and NEF files up to 50 MB.
- Processes images client-side; files are not uploaded to an external server.
- Stores processed blobs temporarily in IndexedDB instead of keeping the whole batch in memory.
- Exports deterministic ZIP files through chunk planning that adapts to the device:
  - 96 MB chunks on mobile browsers.
  - 128 MB chunks on low-memory desktop browsers.
  - 500 MB chunks on standard desktop browsers.
- Includes a responsive theme selector with light, dark and system modes.

## Stack

- Vite
- Tailwind CSS
- Vanilla JavaScript ES modules with `@ts-check`
- Web Workers
- IndexedDB
- JSZip and UTIF bundled through npm dependencies

## Local Development

```bash
npm install
npm run dev
```

Build the production bundle:

```bash
npm run build
```

Run the automated tests:

```bash
npm test
```

## Test Coverage

The test suite covers file validation, MIME handling, ZIP planning, worker source checks, theme behavior, responsive layout smoke checks and a production smoke test that opens `dist/index.html` through a local browser server.

## Architecture

- `src/js/core/compressor.js`: coordinates file intake, worker jobs, progress and export state.
- `src/js/core/exporter.js`: creates ZIP chunks and triggers downloads.
- `src/js/core/file-rules.js`: validates supported file types and size limits.
- `src/js/core/zip-limits.js`: resolves safe ZIP chunk sizes per runtime environment.
- `src/js/ui/theme.js`: manages theme persistence and dropdown interaction.
- `src/js/workers/worker.js`: performs image decoding and conversion off the main thread.
- `src/js/workers/zip.worker.js`: builds ZIP blobs away from the UI thread.

