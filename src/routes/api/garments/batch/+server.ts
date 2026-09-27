import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { garments } from '$lib/server/db/schema';
import crypto from 'node:crypto';
import { saveLocalFile, getLocalFileUrl } from '$lib/server/storage';
import { uploadImageToCloudinary } from '$lib/server/ai/cloudinary';
import { isLocalAiPreferred, checkLocalAiHealth, generateFlatLayLocally } from '$lib/server/ai/local-ai-client';
import { generateRetailFlatLay } from '$lib/server/ai/pollinations';
import { validateSafeUrl } from '$lib/server/url-guard';

const VALID_CATEGORIES = ['tops', 'bottoms', 'shoes', 'outerwear', 'accessories'] as const;

function parseTags(rawTags: any): string[] {
	if (!rawTags) return [];
	if (Array.isArray(rawTags)) {
		return rawTags.map((t) => String(t).trim()).filter(Boolean);
	}
	if (typeof rawTags === 'string') {
		try {
			const parsed = JSON.parse(rawTags);
			if (Array.isArray(parsed)) return parsed.map((t) => String(t).trim()).filter(Boolean);
		} catch {
			return rawTags
				.split(',')
				.map((t) => t.trim())
				.filter(Boolean);
		}
	}
	return [];
}

/**
 * POST /api/garments/batch
 * Batch programmatic insertion of multiple garments.
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json().catch(() => null);
		if (!body) {
			throw error(400, 'Invalid JSON body');
		}

		const itemsList = Array.isArray(body) ? body : Array.isArray(body.items) ? body.items : null;
		if (!itemsList || !itemsList.length) {
			throw error(400, 'No garments provided. Expected a JSON array or { "items": [...] }');
		}

		console.log(`[Batch API] Processing batch creation for ${itemsList.length} garment(s)...`);
		const createdGarments = [];

		for (const item of itemsList) {
			const name = String(item.name || '').trim();
			const categoryRaw = String(item.category || '').trim().toLowerCase();

			if (!name) continue;
			const category = (VALID_CATEGORIES.includes(categoryRaw as any) ? categoryRaw : 'tops') as (typeof VALID_CATEGORIES)[number];
			const description = String(item.description || '').trim();
			const tags = parseTags(item.tags);
			const garmentId = crypto.randomUUID();

			let rawCropBuffer: Buffer | null = null;
			let cropPath = '';
			let finalImageUrl = item.imageUrl || item.image_url || item.stagedImageUrl || '';

			// Decode base64 if provided
			if (item.imageBase64 || item.image_base64) {
				try {
					let b64 = String(item.imageBase64 || item.image_base64).trim();
					if (b64.includes('base64,')) b64 = b64.split('base64,').pop()!;
					rawCropBuffer = Buffer.from(b64, 'base64');
				} catch {}
			}

			// Download remote URL if image buffer not yet available and not already a Cloudinary/local URL
			if (!rawCropBuffer && finalImageUrl && finalImageUrl.startsWith('http') && !finalImageUrl.includes('cloudinary.com')) {
				try {
					const safeUrl = await validateSafeUrl(finalImageUrl);
					const res = await fetch(safeUrl);
					if (res.ok) {
						rawCropBuffer = Buffer.from(await res.arrayBuffer());
					}
				} catch (err: any) {
					console.warn('[Batch API] Blocked or failed fetching remote image URL:', err.message);
				}
			}

			if (rawCropBuffer && !cropPath) {
				cropPath = await saveLocalFile('crops', `batch_${garmentId}_crop.jpg`, rawCropBuffer);
			}

			const shouldGenerate = item.generateStudioImage ?? (!finalImageUrl || item.generate_studio_image);

			if (shouldGenerate) {
				let flatLayBuf: Buffer | null = null;
				const refBase64 = rawCropBuffer ? rawCropBuffer.toString('base64') : undefined;

				try {
					if (await isLocalAiPreferred()) {
						const health = await checkLocalAiHealth();
						if (health.available && health.capabilities?.includes('generate-flatlay')) {
							const localBuf = await generateFlatLayLocally({
								name,
								category,
								description: description || undefined,
								tags,
								imageBase64: refBase64
							});
							if (localBuf && localBuf.length > 5000) {
								flatLayBuf = localBuf;
							}
						}
					}
				} catch {}

				if (!flatLayBuf) {
					try {
						flatLayBuf = await generateRetailFlatLay({
							name,
							category,
							description: description || undefined,
							tags
						});
					} catch {}
				}

				if (flatLayBuf) {
					try {
						finalImageUrl = await uploadImageToCloudinary(
							flatLayBuf,
							'catalog_studio',
							`studio_batch_${garmentId}`
						);
					} catch {
						const localPath = await saveLocalFile('crops', `studio_batch_${garmentId}.jpg`, flatLayBuf);
						finalImageUrl = getLocalFileUrl(localPath);
					}
					if (!cropPath) {
						cropPath = await saveLocalFile('crops', `batch_${garmentId}_crop.jpg`, flatLayBuf);
					}
				}
			}

			if (!finalImageUrl && rawCropBuffer) {
				try {
					finalImageUrl = await uploadImageToCloudinary(rawCropBuffer, 'catalog', `batch_${garmentId}`);
				} catch {
					finalImageUrl = getLocalFileUrl(cropPath);
				}
			}

			if (!cropPath) {
				cropPath = `crops/batch_${garmentId}_crop.jpg`;
			}
			if (!finalImageUrl) {
				finalImageUrl = getLocalFileUrl(cropPath);
			}

			const [inserted] = await db
				.insert(garments)
				.values({
					id: garmentId,
					name,
					category,
					description,
					tags: JSON.stringify(tags),
					imageUrl: finalImageUrl,
					cropPath,
					sourcePhotoId: 'batch_api'
				})
				.returning();

			createdGarments.push({
				...inserted,
				tags: JSON.parse(inserted.tags)
			});
		}

		return json(
			{
				success: true,
				count: createdGarments.length,
				items: createdGarments
			},
			{ status: 201 }
		);
	} catch (err: any) {
		console.error('[Batch API] Error:', err);
		if (err.status) throw err;
		throw error(500, err.message || 'Failed to batch insert garments');
	}
};
