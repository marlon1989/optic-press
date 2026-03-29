const fs = require('fs');
const path = require('path');

const TESTS_DIR = path.join(__dirname, '..', 'tests', 'fake');
if (!fs.existsSync(TESTS_DIR)) {
  fs.mkdirSync(TESTS_DIR, { recursive: true });
}

/**
 * Creates a very simple RGB TIFF file.
 * @param {string} filename 
 * @param {number} width 
 * @param {number} height 
 */
function generateFakeNEF(filename, width, height) {
  const pixelData = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixelData.length; i += 3) {
    pixelData[i] = (i / 3) % 256; // R
    pixelData[i+1] = ((i / 3) / width) % 256; // G
    pixelData[i+2] = 128; // B
  }

  // Minimal TIFF Header + IFD
  // This is a simplified version, manually constructed.
  const header = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00]);
  
  // IFD: 10 entries
  const numEntries = 10;
  const ifd = Buffer.alloc(2 + numEntries * 12 + 4);
  ifd.writeUInt16LE(numEntries, 0);

  let offset = 2;
  const writeEntry = (tag, type, count, val) => {
    ifd.writeUInt16LE(tag, offset);
    ifd.writeUInt16LE(type, offset + 2);
    ifd.writeUInt32LE(count, offset + 4);
    ifd.writeUInt32LE(val, offset + 8);
    offset += 12;
  };

  const pixelDataOffset = 8 + ifd.length + 24; // Some buffer for BPS array
  
  writeEntry(256, 3, 1, width); // ImageWidth
  writeEntry(257, 3, 1, height); // ImageLength
  writeEntry(258, 3, 3, 8 + ifd.length); // BitsPerSample (offset to [8,8,8])
  writeEntry(262, 3, 1, 2); // PhotometricInterpretation (RGB)
  writeEntry(273, 4, 1, pixelDataOffset); // StripOffsets
  writeEntry(277, 3, 1, 3); // SamplesPerPixel
  writeEntry(278, 3, 1, height); // RowsPerStrip
  writeEntry(279, 4, 1, pixelData.length); // StripByteCounts
  writeEntry(282, 5, 1, 0); // XResolution (dummy)
  writeEntry(283, 5, 1, 0); // YResolution (dummy)

  ifd.writeUInt32LE(0, offset); // Next IFD offset

  const bpsArray = Buffer.from([0x08, 0x00, 0x08, 0x00, 0x08, 0x00]);
  
  const finalBuffer = Buffer.concat([header, ifd, bpsArray, Buffer.alloc(18), pixelData]); // 18 bytes padding for offset alignment
  
  fs.writeFileSync(path.join(TESTS_DIR, filename), finalBuffer);
  console.log(`Generated ${filename} (${width}x${height})`);
}

// 1. Simple valid RGB NEF
generateFakeNEF('valid_rgb.nef', 100, 100);

// 2. Multi-IFD (Thumbnail + Main) 
// This one is harder to "fake" manually without a library, but I'll try 
// to just make a larger one to test the "Largest IFD" logic.
generateFakeNEF('large_rgb.nef', 800, 600);

console.log('Fake NEF generation complete.');
process.exit(0);
