import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { processMultiGarmentPhoto } from '$lib/server/garment-pipeline';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const formData = await request.formData();
		const file = formData.get('photo');

		if (!file || !(file instanceof File)) {
			throw error(400, 'A valid image file named "photo" is required');
		}

		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		console.log(`Processing upload: ${file.name} (${(buffer.length / 1024).toFixed(1)} KB)`);
		const result = await processMultiGarmentPhoto(buffer, file.name);

		return json(result);
	} catch (err: any) {
		console.error('Upload processing error:', err);
		throw error(500, err.message || 'Failed to process uploaded photo');
	}
};
