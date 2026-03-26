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
  sourceQueue: any; // Circular dependency with OpticFileQueue avoided here
  db: any;
  zipWorkerUrl: string | URL;
  showToast?: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}
