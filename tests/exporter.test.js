import assert from 'node:assert/strict';
import test from 'node:test';

import { OpticExporter } from '../src/js/core/exporter.js';

class FakeExportButton {
  constructor() {
    this.innerHTML = 'Download';
    this.listener = null;
    this.classList = new FakeExportButtonClassList();
  }

  addEventListener(_eventName, listener) {
    this.listener = listener;
  }
}

class FakeExportButtonClassList {
  constructor() {
    this.classNames = new Set();
  }

  add(className) {
    this.classNames.add(className);
  }

  remove(className) {
    this.classNames.delete(className);
  }

  contains(className) {
    return this.classNames.has(className);
  }
}

class FakeDownloadAnchor {
  constructor() {
    this.href = '';
    this.download = '';
    this.clicked = false;
  }

  click() {
    this.clicked = true;
  }
}

class FakeExportDatabase {
  constructor() {
    this.clearCount = 0;
  }

  async clear() {
    this.clearCount++;
  }
}

class FakeZipWorker {
  constructor() {
    this.onmessage = null;
    this.onerror = null;
    this.terminated = false;
  }

  postMessage() {
    queueMicrotask(() => {
      this.onmessage?.({ data: { chunkBlob: new Blob(['zip-bytes']) } });
    });
  }

  terminate() {
    this.terminated = true;
  }
}

test('exportAll keeps compressed blobs available for repeated downloads', async () => {
  const database = new FakeExportDatabase();
  const button = new FakeExportButton();
  const downloadUrls = [];
  const previousDocument = globalThis.document;
  const previousURL = globalThis.URL;

  globalThis.document = {
    createElement() {
      return new FakeDownloadAnchor();
    },
  };
  globalThis.URL = {
    createObjectURL(blob) {
      downloadUrls.push(blob);
      return `blob:optic-${downloadUrls.length}`;
    },
    revokeObjectURL() {},
  };

  const exporter = new OpticExporter({
    btn: button,
    db: database,
    createZipWorker: () => new FakeZipWorker(),
    sourceQueue: {
      zipFolderName: 'photos',
      processedFileStats: [
        { id: '1', filename: 'a.jpg', size: 10, mime: 'image/jpeg' },
      ],
    },
  });

  try {
    await exporter.exportAll();
    await exporter.exportAll();
  } finally {
    globalThis.document = previousDocument;
    globalThis.URL = previousURL;
  }

  assert.equal(database.clearCount, 0);
  assert.equal(downloadUrls.length, 2);
});
