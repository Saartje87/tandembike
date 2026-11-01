import { isIPv4, isIPv6 } from 'node:net';

const ipv4MappedPrefix = '::ffff:';

/**
 * Whether a socket's remote address is this machine's loopback interface:
 * 127.0.0.0/8, ::1, or 127.x written as an IPv4-mapped IPv6 address. The
 * server refuses every other connection (ADR 0022).
 */
export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  const lower = address.toLowerCase();
  if (isIPv6(lower)) {
    if (lower === '::1') return true;
    return (
      lower.startsWith(ipv4MappedPrefix) &&
      isLoopbackIPv4(lower.slice(ipv4MappedPrefix.length))
    );
  }
  return isLoopbackIPv4(lower);
}

function isLoopbackIPv4(address: string): boolean {
  return isIPv4(address) && address.split('.')[0] === '127';
}
