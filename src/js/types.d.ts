/**
 * OpticPress Global Type Definitions
 * This file provides ambient types for the entire project.
 * It resolves duplicate identifier issues in JSDoc while maintaining
 * full IDE Intellisense across Main Thread and Web Workers.
 */

/**
 * Metadata for a processed and persisted file in IndexedDB.
 */
interface ProcessedFileStat {
  id: string;
  filename: string;
  size: number;
  mime: string;
}

type ToastType = 'info' | 'success' | 'warning' | 'error';

interface OpticFileQueueLike {
  processedFileStats: ProcessedFileStat[];
  zipFolderName: string | null;
}

interface OpticStorage {
  clear(): Promise<void>;
}

interface Window {
  showToast?: (message: string, type?: ToastType) => void;
}

/**
 * Configuration for the OpticUI manager.
 */
interface OpticUIConfig {
  dropZone: HTMLElement | null;
  activeSection: HTMLElement | null;
  jobsList: HTMLElement | null;
  countText: HTMLElement | null;
  completedSection: HTMLElement | null;
  completedStatsText: HTMLElement | null;
  downloadBtnText: HTMLElement | null;
}

/**
 * Message sent to the compression Worker.
 */
interface WorkerMessage {
  id: string;
  file: File;
  quality: number;
  targetMime?: string;
}

/**
 * Success result from the compression Worker.
 */
interface WorkerResultSuccess {
  id: string;
  success: true;
  finalSize: number;
  savingsPct: number;
  filename: string;
  finalMime: string;
  originalSize: number;
}

/**
 * Error result from the compression Worker.
 */
interface WorkerResultError {
  id: string;
  success: false;
  error: string;
  filename: string;
}

/**
 * Configuration for the OpticExporter.
 */
interface OpticExporterConfig {
  btn: HTMLElement | null;
  sourceQueue: OpticFileQueueLike;
  db: OpticStorage;
  createZipWorker: () => Worker;
  showToast?: (message: string, type?: ToastType) => void;
}

/**
 * UTIF.js Types
 * These definitions match the npm 'utif' module implementation.
 */
declare module 'utif' {
  /**
   * Decodes a TIFF/RAW buffer into a collection of IFDs (directories).
   * @param buffer The ArrayBuffer containing binary data.
   */
  export function decode(buffer: ArrayBuffer | Uint8Array): any[];

  /**
   * Decodes pixel data for a specific IFD.
   * Modifies the 'ifd' object in-place to include '.data' property.
   * @param buffer The original ArrayBuffer containing pixel data.
   * @param ifd The specific IFD object to decode.
   * @param ifds The parent collection of IFDs (often required for LZW/Nikon compression).
   */
  export function decodeImage(buffer: ArrayBuffer | Uint8Array, ifd: any, ifds?: any[]): void;

  /**
   * Converts a decoded IFD into a standard RGBA8 Uint8Array.
   * @param ifd The decoded IFD object (must have been processed by decodeImage).
   */
  export function toRGBA8(ifd: any): Uint8Array;

  const UTIF: {
    decode: typeof decode;
    decodeImage: typeof decodeImage;
    toRGBA8: typeof toRGBA8;
  };

  export default UTIF;
}
