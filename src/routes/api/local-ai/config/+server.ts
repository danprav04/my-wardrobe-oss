import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setLocalAiUrl, getLocalAiUrl, isLocalAiPreferred } from '$lib/server/ai/local-ai-client';
import { db } from '$lib/server/db';
import { appSettings } from '$lib/server/db/schema';

export const GET: RequestHandler = async () => {
	const url = await getLocalAiUrl();
	const preferLocal = await isLocalAiPreferred();
	return json({ url, preferLocal });
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		if (typeof body.url === 'string') {
			const testUrl = body.url.trim().replace(/\/+$/, '');
			if (testUrl) {
				const parsed = new URL(testUrl);
				if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
					throw error(400, 'Invalid URL protocol: only http and https are allowed');
				}
				const allowedHosts = ['localhost', '127.0.0.1', '::1', '[::1]', 'local-ai', 'host.docker.internal'];
				if (!allowedHosts.includes(parsed.hostname)) {
					throw error(400, 'Only local AI server hostnames (localhost, 127.0.0.1, local-ai, host.docker.internal) are permitted');
				}
				await setLocalAiUrl(testUrl);
			}
		}
		if (typeof body.preferLocal === 'boolean') {
			await db
				.insert(appSettings)
				.values({ key: 'prefer_local_ai', value: String(body.preferLocal) })
				.onConflictDoUpdate({
					target: appSettings.key,
					set: { value: String(body.preferLocal) }
				});
		}

		const updatedUrl = await getLocalAiUrl();
		const updatedPrefer = await isLocalAiPreferred();
		return json({ success: true, url: updatedUrl, preferLocal: updatedPrefer });
	} catch (err: any) {
		throw error(500, err.message || 'Failed to update Local AI configuration');
	}
};
