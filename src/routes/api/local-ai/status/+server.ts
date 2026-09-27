import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkLocalAiHealth, getLocalAiUrl, isLocalAiPreferred } from '$lib/server/ai/local-ai-client';

export const GET: RequestHandler = async () => {
	try {
		const currentUrl = await getLocalAiUrl();
		const preferLocal = await isLocalAiPreferred();
		const health = await checkLocalAiHealth(currentUrl);

		return json({
			...health,
			preferLocal,
			currentUrl
		});
	} catch (err: any) {
		return json({
			available: false,
			latencyMs: 0,
			url: '',
			error: err.message
		});
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json().catch(() => ({}));
		let testUrl = body.url ? body.url.trim().replace(/\/+$/, '') : undefined;

		if (testUrl) {
			try {
				const parsed = new URL(testUrl);
				if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
					return json({ available: false, latencyMs: 0, url: testUrl, error: 'Invalid URL protocol' }, { status: 400 });
				}
				const allowedHosts = ['localhost', '127.0.0.1', '::1', '[::1]', 'local-ai', 'host.docker.internal'];
				if (!allowedHosts.includes(parsed.hostname)) {
					return json({ available: false, latencyMs: 0, url: testUrl, error: 'Only local AI server hostnames are permitted' }, { status: 400 });
				}
			} catch {
				return json({ available: false, latencyMs: 0, url: testUrl, error: 'Invalid URL format' }, { status: 400 });
			}
		}

		const health = await checkLocalAiHealth(testUrl);

		return json(health);
	} catch (err: any) {
		return json({
			available: false,
			latencyMs: 0,
			url: '',
			error: err.message
		}, { status: 400 });
	}
};
