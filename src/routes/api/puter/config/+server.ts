import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getPuterToken,
	getActiveImageEngine,
	setActiveImageEngine,
	type ImageGenEngine
} from '$lib/server/ai/puter-client';
import { getGeminiImageApiKey } from '$lib/server/ai/gemini-image';

export const GET: RequestHandler = async () => {
	const token = await getPuterToken();
	const geminiImageKey = await getGeminiImageApiKey();
	const engine = await getActiveImageEngine();
	return json({
		hasToken: Boolean(token),
		hasGeminiImageKey: Boolean(geminiImageKey),
		engine
	});
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const { engine } = body;

		if (engine !== undefined) {
			const validEngines: ImageGenEngine[] = ['puter', 'local', 'cloud'];
			if (!validEngines.includes(engine)) {
				throw error(400, `Invalid engine "${engine}". Must be one of: ${validEngines.join(', ')}`);
			}
			await setActiveImageEngine(engine);
		}

		const currentToken = await getPuterToken();
		const currentGeminiImageKey = await getGeminiImageApiKey();
		const currentEngine = await getActiveImageEngine();

		return json({
			success: true,
			hasToken: Boolean(currentToken),
			hasGeminiImageKey: Boolean(currentGeminiImageKey),
			engine: currentEngine
		});
	} catch (err: any) {
		if (err.status) throw err;
		throw error(500, err.message || 'Failed to update Puter configuration');
	}
};
