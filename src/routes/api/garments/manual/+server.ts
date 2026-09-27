import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { garments } from '$lib/server/db/schema';
import crypto from 'node:crypto';
import { saveLocalFile, getLocalFileUrl } from '$lib/server/storage';
import { uploadImageToCloudinary, stageProductPhoto } from '$lib/server/ai/cloudinary';
import { isLocalAiPreferred, checkLocalAiHealth, generateFlatLayLocally } from '$lib/server/ai/local-ai-client';
import { generateRetailFlatLay } from '$lib/server/ai/pollinations';
import { getActiveImageEngine, generateFlatLayWithPuter, hasCloudImageKey } from '$lib/server/ai/puter-client';
import { validateSafeUrl } from '$lib/server/url-guard';

const VALID_CATEGORIES = ['tops', 'bottoms', 'shoes', 'outerwear', 'accessories'] as const;
type Category = (typeof VALID_CATEGORIES)[number];

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
			// Comma-separated fallback
			return rawTags
				.split(',')
				.map((t) => t.trim())
				.filter(Boolean);
		}
	}
	return [];
}

/**
 * GET /api/garments/manual
 * Interactive schema documentation and ready-to-run curl examples.
 */
export const GET: RequestHandler = async ({ url }) => {
	const host = url.origin;
	return json({
		status: 'ok',
		service: 'My Wardrobe Programmatic Garment API',
		description: 'Allows external scripts, curl, webhooks, and automations to add clothing and footwear items manually into the wardrobe catalog.',
		validCategories: VALID_CATEGORIES,
		supportedFormats: ['application/json', 'multipart/form-data'],
		schema: {
			name: { type: 'string', required: true, description: 'Display name of the garment' },
			category: { type: 'string', required: true, options: VALID_CATEGORIES },
			description: { type: 'string', required: false, description: 'Detailed fabric, wash, pattern, and style description' },
			tags: { type: 'array of strings | comma-separated string', required: false, description: 'Searchable style tags' },
			image: { type: 'File binary', required: false, description: 'Image file upload (multipart/form-data)' },
			imageUrl: { type: 'string URL', required: false, description: 'Public URL to download and ingest image' },
			imageBase64: { type: 'string base64', required: false, description: 'Raw base64 or data URI image' },
			generateStudioImage: { type: 'boolean', required: false, default: 'true if no image provided', description: 'Renders an e-commerce retail flat-lay on #f4f4f5 via Local AI (Qwen DiT on RTX 5070 Ti) guided by reference crop if provided' },
			stageWithAi: { type: 'boolean', required: false, default: false, description: 'Applies Cloudinary AI background replacement on custom uploaded image' }
		},
		examples: {
			curl_multipart_file_upload: `curl -X POST "${host}/api/garments/manual" \\
  -F "name=Classic Levi 501 Jeans" \\
  -F "category=bottoms" \\
  -F "description=Straight leg button fly denim jeans in dark blue wash" \\
  -F "tags=denim, blue, casual, straight leg" \\
  -F "image=@/path/to/jeans.jpg"`,

			curl_json_with_local_ai_generation: `curl -X POST "${host}/api/garments/manual" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Heavyweight Black Boxy Hoodie",
    "category": "tops",
    "description": "450gsm French terry cotton oversized drop-shoulder hoodie in washed black",
    "tags": ["black", "cotton", "hoodie", "streetwear", "heavyweight"],
    "generateStudioImage": true
  }'`,

			curl_json_with_remote_url: `curl -X POST "${host}/api/garments/manual" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Nike Air Max 90 Infrared",
    "category": "shoes",
    "description": "Iconic retro running sneakers in white, cool grey, and radiant infrared",
    "tags": ["sneakers", "nike", "running", "retro", "white", "infrared"],
    "imageUrl": "https://images.unsplash.com/photo-1542291026-7eec264c27ff"
  }'`
		}
	});
};

/**
 * POST /api/garments/manual
 * Programmatically adds a garment manually from outside.
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const contentType = request.headers.get('content-type') || '';
		let name = '';
		let categoryRaw = '';
		let description = '';
		let tagsRaw: any = [];
		let imageUrlInput = '';
		let imageBase64Input = '';
		let generateStudioImage: boolean | undefined = undefined;
		let stageWithAi = false;
		let uploadedFileBuffer: Buffer | null = null;
		let uploadedCropBuffer: Buffer | null = null;

		// 1. Parse Multipart Form Data
		if (contentType.includes('multipart/form-data')) {
			const formData = await request.formData();
			name = String(formData.get('name') || '').trim();
			categoryRaw = String(formData.get('category') || '').trim();
			description = String(formData.get('description') || '').trim();
			tagsRaw = formData.get('tags');
			imageUrlInput = String(formData.get('imageUrl') || formData.get('image_url') || '').trim();
			imageBase64Input = String(formData.get('imageBase64') || formData.get('image_base64') || '').trim();

			if (formData.has('generateStudioImage') || formData.has('generate_studio_image')) {
				const val = formData.get('generateStudioImage') ?? formData.get('generate_studio_image');
				generateStudioImage = val === 'true' || val === '1';
			}

			if (formData.has('stageWithAi') || formData.has('stage_with_ai')) {
				const val = formData.get('stageWithAi') ?? formData.get('stage_with_ai');
				stageWithAi = val === 'true' || val === '1';
			}

			const fileField = formData.get('image') || formData.get('file') || formData.get('photo');
			if (fileField && typeof fileField === 'object' && 'arrayBuffer' in fileField) {
				const buf = Buffer.from(await (fileField as File).arrayBuffer());
				if (buf.length > 500) {
					uploadedFileBuffer = buf;
				}
			}

			const cropField = formData.get('crop') || formData.get('cropImage') || formData.get('sourceImage') || formData.get('sourceCrop');
			if (cropField && typeof cropField === 'object' && 'arrayBuffer' in cropField) {
				const buf = Buffer.from(await (cropField as File).arrayBuffer());
				if (buf.length > 500) {
					uploadedCropBuffer = buf;
				}
			}
		} else {
			// 2. Parse Application/JSON
			const body = await request.json().catch(() => ({}));
			name = String(body.name || '').trim();
			categoryRaw = String(body.category || '').trim();
			description = String(body.description || '').trim();
			tagsRaw = body.tags;
			imageUrlInput = String(body.imageUrl || body.image_url || '').trim();
			imageBase64Input = String(body.imageBase64 || body.image_base64 || '').trim();

			if (body.generateStudioImage !== undefined || body.generate_studio_image !== undefined) {
				generateStudioImage = Boolean(body.generateStudioImage ?? body.generate_studio_image);
			}
			if (body.stageWithAi !== undefined || body.stage_with_ai !== undefined) {
				stageWithAi = Boolean(body.stageWithAi ?? body.stage_with_ai);
			}
		}

		// Validation
		if (!name) {
			throw error(400, 'Field "name" is required.');
		}

		const category = categoryRaw.toLowerCase() as Category;
		if (!VALID_CATEGORIES.includes(category)) {
			throw error(
				400,
				`Invalid category "${categoryRaw}". Must be one of: ${VALID_CATEGORIES.join(', ')}`
			);
		}

		const tags = parseTags(tagsRaw);
		const garmentId = crypto.randomUUID();

		// 3. Resolve Input Image Buffer
		let rawCropBuffer: Buffer | null = uploadedFileBuffer;

		if (!rawCropBuffer && imageBase64Input) {
			try {
				let cleanB64 = imageBase64Input.trim();
				if (cleanB64.includes('base64,')) {
					cleanB64 = cleanB64.split('base64,').pop()!;
				}
				const b = Buffer.from(cleanB64, 'base64');
				if (b.length > 500) rawCropBuffer = b;
			} catch (e: any) {
				console.warn('[Manual API] Failed to decode imageBase64:', e.message);
			}
		}

		if (!rawCropBuffer && imageUrlInput && imageUrlInput.startsWith('http')) {
			try {
				const safeUrl = await validateSafeUrl(imageUrlInput);
				console.log(`[Manual API] Downloading image from remote URL: ${safeUrl}`);
				const res = await fetch(safeUrl, {
					headers: { 'User-Agent': 'MyWardrobe-ManualAPI/1.0' }
				});
				if (res.ok) {
					const b = Buffer.from(await res.arrayBuffer());
					if (b.length > 500) rawCropBuffer = b;
				}
			} catch (e: any) {
				console.warn('[Manual API] Failed or blocked downloading imageUrl:', e.message);
			}
		}

		// If no image was provided, default generateStudioImage to true
		if (generateStudioImage === undefined) {
			generateStudioImage = !rawCropBuffer;
		}

		let cropPath = '';
		let finalImageUrl = '';

		// 4. Save crop locally if buffer exists
		const sourceCropToSave = uploadedCropBuffer || rawCropBuffer;
		if (sourceCropToSave) {
			const cropFilename = `manual_${garmentId}_crop.jpg`;
			cropPath = await saveLocalFile('crops', cropFilename, sourceCropToSave);
		}

		// 5. Generate or Stage Image
		// A. Reference-Guided or Text-Based Flat-Lay Generation
		if (generateStudioImage) {
			let flatLayBuf: Buffer | null = null;
			const activeEngine = await getActiveImageEngine();

			// Priority 1: Puter / AI Studio (Default)
			if (activeEngine === 'puter' && rawCropBuffer) {
				try {
					const available = await hasCloudImageKey();
					if (available) {
						console.log(`[Manual API] Generating studio flat-lay with Puter / AI Studio (Gemini 3.1 Flash Image)...`);
						flatLayBuf = await generateFlatLayWithPuter(
							{
								name,
								category,
								description: description || undefined,
								tags
							},
							rawCropBuffer
						);
					}
				} catch (puterErr: any) {
					console.warn(`[Manual API] Puter / AI Studio flat-lay generation failed (${puterErr.message}), trying fallback...`);
				}
			}

			// Priority 2: Local AI (RTX ComfyUI)
			if (!flatLayBuf && (activeEngine === 'local' || activeEngine === 'puter')) {
				const refBase64 = rawCropBuffer ? rawCropBuffer.toString('base64') : undefined;
				try {
					if (await isLocalAiPreferred()) {
						const health = await checkLocalAiHealth();
						if (health.available && health.capabilities?.includes('generate-flatlay')) {
							console.log(`[Manual API] Generating studio flat-lay with Local AI (${health.gpu})...`);
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
				} catch (localErr: any) {
					console.warn(`[Manual API] Local AI flat-lay failed (${localErr.message})...`);
				}
			}

			// Priority 3: Fallback to Puter / AI Studio if active was Local but local failed
			if (!flatLayBuf && activeEngine === 'local' && rawCropBuffer) {
				try {
					const available = await hasCloudImageKey();
					if (available) {
						console.log(`[Manual API] Falling back to Puter / AI Studio...`);
						flatLayBuf = await generateFlatLayWithPuter(
							{
								name,
								category,
								description: description || undefined,
								tags
							},
							rawCropBuffer
						);
					}
				} catch (puterErr: any) {
					console.warn(`[Manual API] Puter / AI Studio fallback failed:`, puterErr.message);
				}
			}

			// Priority 4: Pollinations FLUX as ultimate free cloud fallback
			if (!flatLayBuf) {
				try {
					flatLayBuf = await generateRetailFlatLay({
						name,
						category,
						description: description || undefined,
						tags
					});
				} catch (fluxErr: any) {
					console.warn('[Manual API] Pollinations fallback failed:', fluxErr.message);
				}
			}

			if (flatLayBuf) {
				try {
					finalImageUrl = await uploadImageToCloudinary(
						flatLayBuf,
						'catalog_studio',
						`studio_manual_${garmentId}`
					);
				} catch (cldErr: any) {
					console.warn('[Manual API] Cloudinary upload failed, storing locally:', cldErr.message);
					const localPath = await saveLocalFile('crops', `studio_manual_${garmentId}.jpg`, flatLayBuf);
					finalImageUrl = getLocalFileUrl(localPath);
				}

				if (!cropPath) {
					// Save flat-lay buffer as cropPath too so DB constraint is satisfied
					cropPath = await saveLocalFile('crops', `manual_${garmentId}_crop.jpg`, flatLayBuf);
				}
			}
		}

		// B. Staging or direct upload of custom image
		if (!finalImageUrl && rawCropBuffer) {
			if (stageWithAi) {
				try {
					console.log('[Manual API] Staging product photo with Cloudinary background replacement...');
					finalImageUrl = await stageProductPhoto(rawCropBuffer, garmentId);
				} catch (cldErr: any) {
					console.warn('[Manual API] Cloudinary staging failed, falling back:', cldErr.message);
				}
			}

			if (!finalImageUrl) {
				try {
					finalImageUrl = await uploadImageToCloudinary(rawCropBuffer, 'catalog', `manual_${garmentId}`);
				} catch (cldErr: any) {
					console.warn('[Manual API] Direct Cloudinary upload failed:', cldErr.message);
					finalImageUrl = getLocalFileUrl(cropPath);
				}
			}
		}

		// Fallback guard
		if (!finalImageUrl) {
			if (cropPath) {
				finalImageUrl = getLocalFileUrl(cropPath);
			} else {
				throw error(500, 'Failed to produce or store an image for this garment');
			}
		}

		if (!cropPath) {
			cropPath = `crops/manual_${garmentId}_crop.jpg`;
		}

		// 6. Insert into Database
		const [created] = await db
			.insert(garments)
			.values({
				id: garmentId,
				name,
				category,
				description: description || '',
				tags: JSON.stringify(tags),
				imageUrl: finalImageUrl,
				cropPath,
				originalPath: null,
				sourcePhotoId: 'manual_api'
			})
			.returning();

		console.log(`[Manual API] Created garment "${created.name}" (${created.id}) with image: ${created.imageUrl}`);

		return json(
			{
				success: true,
				garment: {
					...created,
					tags: JSON.parse(created.tags)
				}
			},
			{ status: 201 }
		);
	} catch (err: any) {
		console.error('[Manual API] Error creating garment:', err);
		if (err.status) throw err;
		throw error(500, err.message || 'Internal server error adding garment');
	}
};
