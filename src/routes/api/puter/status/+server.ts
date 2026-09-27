import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkPuterStatus, getPuterToken } from '$lib/server/ai/puter-client';

export const GET: RequestHandler = async () => {
	const token = await getPuterToken();
	if (!token) {
		return json({
			available: false,
			latencyMs: 0,
			model: 'gemini-3.1-flash-image-preview',
			error: 'No Puter Auth Token configured'
		});
	}

	const status = await checkPuterStatus(token);
	return json(status);
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const token = (body.token || '').trim() || (await getPuterToken());

		if (!token) {
			return json({
				available: false,
				latencyMs: 0,
				model: 'gemini-3.1-flash-image-preview',
				error: 'Please provide a Puter Auth Token'
			});
		}

		const status = await checkPuterStatus(token);
		return json(status);
	} catch (err: any) {
		return json({
			available: false,
			latencyMs: 0,
			model: 'gemini-3.1-flash-image-preview',
			error: err.message || 'Failed to check Puter status'
		});
	}
};
