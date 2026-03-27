// @ts-check

/**
 * Robust HTML escaping to prevent XSS.
 * Sanitizes &, <, >, ", and ' characters.
 * @param {string | null | undefined} str
 * @returns {string}
 */
export function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
