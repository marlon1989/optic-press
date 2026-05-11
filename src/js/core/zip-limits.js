// @ts-check

const BYTES_PER_MB = 1024 * 1024;

export const MOBILE_ZIP_CHUNK_MB = 96;
export const LOW_MEMORY_ZIP_CHUNK_MB = 128;
export const DESKTOP_ZIP_CHUNK_MB = 256;

/**
 * @param {{ userAgent?: string, deviceMemory?: number }} environment
 * @returns {number}
 */
export function resolveZipChunkMegabytes(environment) {
  if (isMobileUserAgent(environment.userAgent || '')) return MOBILE_ZIP_CHUNK_MB;
  if (typeof environment.deviceMemory === 'number' && environment.deviceMemory < 4) {
    return LOW_MEMORY_ZIP_CHUNK_MB;
  }
  return DESKTOP_ZIP_CHUNK_MB;
}

/** @returns {number} */
export function getMaxZipChunkBytes() {
  return resolveZipChunkMegabytes(getRuntimeEnvironment()) * BYTES_PER_MB;
}

/**
 * @returns {{ userAgent: string, deviceMemory?: number }}
 */
function getRuntimeEnvironment() {
  if (typeof navigator === 'undefined') return { userAgent: '' };

  return {
    userAgent: navigator.userAgent || '',
    // @ts-ignore - deviceMemory is Chromium-only.
    deviceMemory: navigator.deviceMemory,
  };
}

/**
 * @param {string} userAgent
 * @returns {boolean}
 */
function isMobileUserAgent(userAgent) {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
}
