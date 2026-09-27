import dns from 'node:dns/promises';
import { URL } from 'node:url';

function isPrivateIpv4(ip: string): boolean {
	const parts = ip.split('.').map((p) => parseInt(p, 10));
	if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
		return true; // Malformed IPv4 treated as unsafe
	}

	const [a, b] = parts;

	// 0.0.0.0/8 (Current network)
	if (a === 0) return true;
	// 10.0.0.0/8 (Private RFC1918)
	if (a === 10) return true;
	// 127.0.0.0/8 (Loopback)
	if (a === 127) return true;
	// 169.254.0.0/16 (Link-local & Cloud Metadata 169.254.169.254)
	if (a === 169 && b === 254) return true;
	// 172.16.0.0/12 (Private RFC1918: 172.16.0.0 - 172.31.255.255)
	if (a === 172 && b >= 16 && b <= 31) return true;
	// 192.168.0.0/16 (Private RFC1918)
	if (a === 192 && b === 168) return true;
	// 100.64.0.0/10 (Carrier-grade NAT: 100.64.0.0 - 100.127.255.255)
	if (a === 100 && b >= 64 && b <= 127) return true;
	// 224.0.0.0/4 (Multicast)
	if (a >= 224 && a <= 239) return true;
	// 240.0.0.0/4 (Reserved / Future use)
	if (a >= 240) return true;

	return false;
}

function isPrivateIpv6(ip: string): boolean {
	const lower = ip.toLowerCase();
	// Loopback / Unspecified
	if (lower === '::1' || lower === '::' || lower === '0:0:0:0:0:0:0:1' || lower === '0:0:0:0:0:0:0:0') {
		return true;
	}
	// IPv4-mapped IPv6 (::ffff:127.0.0.1)
	if (lower.startsWith('::ffff:')) {
		const mapped = lower.slice(7);
		if (mapped.includes('.')) {
			return isPrivateIpv4(mapped);
		}
	}
	// Unique Local Address fc00::/7 (fc.. or fd..)
	if (lower.startsWith('fc') || lower.startsWith('fd')) {
		return true;
	}
	// Link-Local fe80::/10
	if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) {
		return true;
	}
	return false;
}

/**
 * Validates that a user-supplied URL is safe for server-side fetching.
 * Blocks SSRF attacks against private networks, localhost, link-local metadata endpoints,
 * non-HTTP schemes, and non-routable domains.
 */
export async function validateSafeUrl(rawUrl: string): Promise<string> {
	if (!rawUrl || typeof rawUrl !== 'string') {
		throw new Error('URL must be a non-empty string');
	}

	let parsed: URL;
	try {
		parsed = new URL(rawUrl.trim());
	} catch {
		throw new Error(`Invalid URL format: ${rawUrl}`);
	}

	// Only allow http and https protocols
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new Error(`Disallowed URL scheme: ${parsed.protocol}`);
	}

	const hostname = parsed.hostname.toLowerCase();

	// Block obvious local hostnames
	if (
		hostname === 'localhost' ||
		hostname.endsWith('.localhost') ||
		hostname.endsWith('.local') ||
		hostname.endsWith('.internal')
	) {
		throw new Error(`Blocked internal hostname: ${hostname}`);
	}

	// Check if hostname is an IP literal
	const cleanHostname = hostname.replace(/^\[|\]$/g, '');
	if (/^(\d{1,3}\.){3}\d{1,3}$/.test(cleanHostname)) {
		if (isPrivateIpv4(cleanHostname)) {
			throw new Error(`Blocked private IP address: ${cleanHostname}`);
		}
	} else if (cleanHostname.includes(':')) {
		if (isPrivateIpv6(cleanHostname)) {
			throw new Error(`Blocked private IPv6 address: ${cleanHostname}`);
		}
	}

	// Resolve hostname via DNS and check all resolved addresses
	try {
		const records = await dns.lookup(cleanHostname, { all: true });
		if (!records.length) {
			throw new Error(`Failed to resolve hostname: ${cleanHostname}`);
		}

		for (const record of records) {
			if (record.family === 4 && isPrivateIpv4(record.address)) {
				throw new Error(`Hostname ${cleanHostname} resolves to private IPv4 address: ${record.address}`);
			}
			if (record.family === 6 && isPrivateIpv6(record.address)) {
				throw new Error(`Hostname ${cleanHostname} resolves to private IPv6 address: ${record.address}`);
			}
		}
	} catch (err: any) {
		if (err.message.includes('resolves to private') || err.message.includes('Blocked')) {
			throw err;
		}
		// If DNS resolution fails, reject to prevent blind SSRF
		throw new Error(`DNS lookup failed for hostname: ${cleanHostname} (${err.message})`);
	}

	return parsed.toString();
}
