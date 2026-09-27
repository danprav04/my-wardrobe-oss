import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readLocalFile } from '$lib/server/storage';

export const GET: RequestHandler = async ({ params }) => {
	const filePath = params.path;
	if (!filePath) {
		throw error(400, 'File path required');
	}

	// Security: prevent directory traversal
	if (filePath.includes('..')) {
		throw error(403, 'Invalid file path');
	}

	try {
		const buffer = await readLocalFile(filePath);

		let contentType = 'application/octet-stream';
		if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
			contentType = 'image/jpeg';
		} else if (filePath.endsWith('.png')) {
			contentType = 'image/png';
		} else if (filePath.endsWith('.webp')) {
			contentType = 'image/webp';
		}

		return new Response(new Uint8Array(buffer), {
			headers: {
				'Content-Type': contentType,
				'Cache-Control': 'public, max-age=31536000, immutable'
			}
		});
	} catch (err: any) {
		if (err.message && err.message.includes('Path traversal blocked')) {
			throw error(403, 'Forbidden file path');
		}
		if (err.code === 'ENOENT') {
			throw error(404, 'File not found');
		}
		throw error(500, `Failed to read file: ${err.message}`);
	}
};
