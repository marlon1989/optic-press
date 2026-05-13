// @ts-check

/**
 * Prevents local production smoke runs from requesting Vercel-only endpoints.
 * Example: `shouldInjectVercelTelemetry(location.hostname)`.
 * @param {string} hostname
 * @returns {boolean}
 */
export function shouldInjectVercelTelemetry(hostname) {
  const normalizedHostname = hostname.trim().toLowerCase();
  if (!normalizedHostname) return false;
  if (normalizedHostname === 'localhost') return false;
  if (normalizedHostname === '127.0.0.1') return false;
  if (normalizedHostname.startsWith('192.168.')) return false;
  if (normalizedHostname.startsWith('10.')) return false;
  if (isPrivate172Hostname(normalizedHostname)) return false;
  return true;
}

/**
 * Keeps custom production domains eligible while suppressing private LAN smoke runs.
 * Example: `isPrivate172Hostname("172.16.0.5")`.
 * @param {string} hostname
 * @returns {boolean}
 */
function isPrivate172Hostname(hostname) {
  const octets = hostname.split('.');
  if (octets.length !== 4 || octets[0] !== '172') return false;

  const secondOctet = Number(octets[1]);
  if (!Number.isInteger(secondOctet)) return false;
  return secondOctet >= 16 && secondOctet <= 31;
}
