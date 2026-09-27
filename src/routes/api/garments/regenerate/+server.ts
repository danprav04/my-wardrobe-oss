import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { garments } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { generateRetailFlatLay } from '$lib/server/ai/pollinations';
import { checkLocalAiHealth, isLocalAiPreferred, generateFlatLayLocally } from '$lib/server/ai/local-ai-client';
import { getActiveImageEngine, generateFlatLayWithPuter, hasCloudImageKey } from '$lib/server/ai/puter-client';
import { uploadImageToCloudinary } from '$lib/server/ai/cloudinary';
import { saveLocalFile, readLocalFile } from '$lib/server/storage';

const MAX_BATCH_REGENERATE = 10;

export const POST: RequestHandler = async ({ request }) => {
	try {
		let body: { garmentId?: string; regenerateAll?: boolean } = {};
		try {
			body = await request.json();
		} catch {
			// Invalid or empty body
		}

		let targetGarments = [];
		if (body.garmentId) {
			const found = await db.select().from(garments).where(eq(garments.id, body.garmentId));
			if (!found.length) {
				throw error(404, `Garment ${body.garmentId} not found`);
			}
			targetGarments = found;
		} else if (body.regenerateAll === true) {
			targetGarments = await db.select().from(garments).limit(MAX_BATCH_REGENERATE);
		} else {
			throw error(400, 'garmentId or explicit regenerateAll: true is required');
		}

		console.log(`[Regenerate] Starting retail flat-lay regeneration for ${targetGarments.length} garment(s)...`);
		const updated = [];

		for (const garment of targetGarments) {
			try {
				let tagsArray: string[] = [];
				try {
					tagsArray = JSON.parse(garment.tags || '[]');
				} catch {
					tagsArray = [];
				}

				let flatLayBuffer: Buffer | null = null;
				const activeEngine = await getActiveImageEngine();

				let cropBuf: Buffer | null = null;
				if (garment.cropPath) {
					try {
						cropBuf = await readLocalFile(garment.cropPath);
					} catch (readErr: any) {
						console.warn(`[Regenerate] Could not load crop ${garment.cropPath}:`, readErr.message);
					}
				}

				// Priority 1: Puter / AI Studio (Default)
				if (activeEngine === 'puter' && cropBuf) {
					try {
						const available = await hasCloudImageKey();
						if (available) {
							console.log(`[Regenerate] Generating studio shot with Puter / AI Studio (Gemini 3.1 Flash Image)...`);
							flatLayBuffer = await generateFlatLayWithPuter(
								{
									name: garment.name,
									category: garment.category,
									description: garment.description || undefined,
									tags: tagsArray
								},
								cropBuf
							);
						}
					} catch (puterErr: any) {
						console.warn(`[Regenerate] Puter / AI Studio flat-lay failed (${puterErr.message}), trying local/cloud fallback...`);
					}
				}

				// Priority 2: Local AI (RTX ComfyUI)
				if (!flatLayBuffer && (activeEngine === 'local' || activeEngine === 'puter')) {
					try {
						if (await isLocalAiPreferred()) {
							const health = await checkLocalAiHealth();
							if (health.available && health.capabilities?.includes('generate-flatlay')) {
								console.log(`[Regenerate] Generating studio shot with Local AI (${health.gpu})...`);
								const localBuf = await generateFlatLayLocally({
									name: garment.name,
									category: garment.category,
									description: garment.description || undefined,
									tags: tagsArray,
									imageBase64: cropBuf ? cropBuf.toString('base64') : undefined
								});
								if (localBuf && localBuf.length > 5000) {
									flatLayBuffer = localBuf;
								}
							}
						}
					} catch (localErr: any) {
						console.warn(`[Regenerate] Local AI flat-lay failed (${localErr.message})...`);
					}
				}

				// Priority 3: Fallback to Puter / AI Studio if active was Local but local failed
				if (!flatLayBuffer && activeEngine === 'local' && cropBuf) {
					try {
						const available = await hasCloudImageKey();
						if (available) {
							console.log(`[Regenerate] Falling back to Puter / AI Studio...`);
							flatLayBuffer = await generateFlatLayWithPuter(
								{
									name: garment.name,
									category: garment.category,
									description: garment.description || undefined,
									tags: tagsArray
								},
								cropBuf
							);
						}
					} catch (puterErr: any) {
						console.warn(`[Regenerate] Puter / AI Studio fallback failed:`, puterErr.message);
					}
				}

				// Priority 4: Pollinations FLUX as ultimate free cloud fallback
				if (!flatLayBuffer) {
					flatLayBuffer = await generateRetailFlatLay({
						name: garment.name,
						category: garment.category,
						description: garment.description || undefined,
						tags: tagsArray
					});
				}

				let newImageUrl = '';
				try {
					newImageUrl = await uploadImageToCloudinary(
						flatLayBuffer,
						'catalog_studio',
						`studio_${garment.id}_${Date.now()}`
					);
				} catch (cldErr) {
					console.warn(`[Regenerate] Cloudinary upload failed for ${garment.id}, saving locally:`, cldErr);
					const localPath = await saveLocalFile(
						'crops',
						`studio_${garment.id}_${Date.now()}.jpg`,
						flatLayBuffer
					);
					newImageUrl = `/api/storage/${localPath}`;
				}

				// Update database with the new studio shot URL, keeping cropPath intact
				const [updatedGarment] = await db
					.update(garments)
					.set({ imageUrl: newImageUrl })
					.where(eq(garments.id, garment.id))
					.returning();

				updated.push({
					id: updatedGarment.id,
					name: updatedGarment.name,
					imageUrl: updatedGarment.imageUrl,
					cropPath: updatedGarment.cropPath
				});
				console.log(`[Regenerate] Completed ${garment.name} -> ${newImageUrl}`);
			} catch (itemErr: any) {
				console.error(`[Regenerate] Failed to regenerate flat-lay for ${garment.name} (${garment.id}):`, itemErr.message);
			}
		}

		return json({
			success: true,
			count: updated.length,
			items: updated
		});
	} catch (err: any) {
		console.error('[Regenerate] Error during flat-lay regeneration:', err);
		throw error(500, err.message || 'Failed to regenerate studio images');
	}
};
