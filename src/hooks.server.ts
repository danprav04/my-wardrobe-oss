import { redirect, type Handle, type ServerInit } from '@sveltejs/kit';
import { ensureDatabaseReady } from '$lib/server/db/init';
import { COOKIE_NAME, validateSessionToken } from '$lib/server/auth';

function getCorsHeaders(requestOrigin?: string | null): Record<string, string> {
	const isProduction = process.env.NODE_ENV === 'production';
	const configuredOrigins = (process.env.ALLOWED_ORIGINS || '')
		.split(',')
		.map((o) => o.trim().toLowerCase())
		.filter(Boolean);

	let allowOrigin = '';

	if (requestOrigin) {
		const lowerOrigin = requestOrigin.toLowerCase();
		const isLocalhost =
			lowerOrigin.startsWith('http://localhost:') ||
			lowerOrigin.startsWith('http://127.0.0.1:') ||
			lowerOrigin === 'http://localhost' ||
			lowerOrigin === 'http://127.0.0.1';

		if (configuredOrigins.includes(lowerOrigin) || (!isProduction && isLocalhost)) {
			allowOrigin = requestOrigin;
		}
	}

	const headers: Record<string, string> = {
		'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept',
		'Access-Control-Max-Age': '86400'
	};

	if (allowOrigin) {
		headers['Access-Control-Allow-Origin'] = allowOrigin;
		headers['Vary'] = 'Origin';
	}

	return headers;
}

export const init: ServerInit = async () => {
	await ensureDatabaseReady().catch((err) => {
		console.warn('[Server Init] DB check failed on startup, continuing:', err.message);
	});
};

export const handle: Handle = async ({ event, resolve }) => {
	const pathname = event.url.pathname;
	const origin = event.request.headers.get('origin');
	const corsHeaders = getCorsHeaders(origin);

	// 1. Allow public static assets and Vite internal dev assets
	const isStaticAsset =
		pathname.startsWith('/_app/') ||
		pathname.startsWith('/favicon') ||
		pathname === '/robots.txt' ||
		pathname === '/manifest.json' ||
		pathname === '/site.webmanifest' ||
		pathname.startsWith('/apple-touch-icon') ||
		pathname.startsWith('/icon-') ||
		pathname.startsWith('/__vite') ||
		pathname.startsWith('/@') ||
		pathname.startsWith('/node_modules');

	if (isStaticAsset) {
		return resolve(event);
	}

	// 2. Extract and validate session token from secure HTTP-only cookie or Authorization header
	const authHeader = event.request.headers.get('authorization');
	const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
	const sessionCookie = event.cookies.get(COOKIE_NAME);
	const tokenToValidate = bearerToken || sessionCookie;
	const sessionResult = await validateSessionToken(tokenToValidate);

	event.locals.authenticated = sessionResult.valid;
	if (sessionResult.valid && sessionResult.username) {
		event.locals.username = sessionResult.username;
	}

	// 3. Preflight CORS handling for all /api endpoints
	if (pathname.startsWith('/api') && event.request.method === 'OPTIONS') {
		return new Response(null, {
			status: 204,
			headers: corsHeaders
		});
	}

	// 4. Public auth paths
	if (pathname === '/login') {
		if (sessionResult.valid) {
			// Already authenticated, redirect to home
			redirect(303, '/');
		}
		return resolve(event);
	}

	if (pathname === '/logout') {
		return resolve(event);
	}

	// 5. Unauthenticated requests to protected endpoints
	if (!sessionResult.valid) {
		if (pathname.startsWith('/api')) {
			// API routes return 401 JSON with CORS headers preserved
			return new Response(
				JSON.stringify({
					error: 'Unauthorized',
					message: 'Authentication required to access this endpoint.'
				}),
				{
					status: 401,
					headers: {
						'Content-Type': 'application/json',
						...corsHeaders
					}
				}
			);
		}

		// Web pages redirect to /login
		redirect(303, '/login');
	}

	// 6. Authenticated requests
	const response = await resolve(event);

	// Attach CORS headers to API responses
	if (pathname.startsWith('/api')) {
		for (const [key, value] of Object.entries(corsHeaders)) {
			response.headers.set(key, value);
		}
	}

	return response;
};
