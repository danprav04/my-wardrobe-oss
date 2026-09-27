import sharp from 'sharp';
import crypto from 'node:crypto';
import path from 'node:path';
import { detectGarmentsInPhoto, tagGarmentCrop } from './ai/gemini';
import { stageProductPhoto, uploadImageToCloudinary } from './ai/cloudinary';
import { generateRetailFlatLay } from './ai/pollinations';
import { checkLocalAiHealth, isLocalAiPreferred, generateFlatLayLocally } from './ai/local-ai-client';
import { getActiveImageEngine, generateFlatLayWithPuter, hasCloudImageKey } from './ai/puter-client';
import { saveLocalFile } from './storage';

export interface ProcessedGarmentCandidate {
	tempId: string;
	name: string;
	description: string;
	category: 'tops' | 'bottoms' | 'shoes' | 'outerwear' | 'accessories';
	fit?: string;
	tags: string[];
	stagedImageUrl: string;
	cropPath: string;
	cropUrl: string;
	originalPath: string;
	bbox: [number, number, number, number];
	isProductShot?: boolean;
}

function parseCoord(val: any, fallback = 0): number {
	if (typeof val === 'number') return isNaN(val) ? fallback : val;
	if (typeof val === 'string') {
		const num = parseFloat(val.replace('%', ''));
		return isNaN(num) ? fallback : num;
	}
	return fallback;
}

function extractBoundingBox(det: any): [number, number, number, number] {
	let raw: any = det.bbox ?? det.box_2d ?? det.bounding_box;
	if (!raw && det.ymin !== undefined) raw = [det.ymin, det.xmin, det.ymax, det.xmax];
	if (!raw && det.top !== undefined) raw = [det.top, det.left, det.bottom, det.right];

	// Flatten nested arrays like [[63, 44, 508, 900]] or multiple boxes
	while (Array.isArray(raw) && Array.isArray(raw[0])) {
		raw = raw[0];
	}

	if (!Array.isArray(raw) || raw.length < 4) {
		console.warn('Could not extract 4 coordinates from detection, falling back to default:', det);
		return [5, 5, 95, 95];
	}

	let [ymin, xmin, ymax, xmax] = raw.slice(0, 4).map((v: any) => parseCoord(v, 0));

	// If coordinates are on 0-1000 scale (standard Gemini box_2d), convert to percentage 0-100
	if (Math.max(ymin, xmin, ymax, xmax) > 100) {
		ymin /= 10;
		xmin /= 10;
		ymax /= 10;
		xmax /= 10;
	}
	// If coordinates are on 0-1 normalized float scale (e.g. 0.063, 0.508)
	else if (Math.max(ymin, xmin, ymax, xmax) <= 1.0) {
		ymin *= 100;
		xmin *= 100;
		ymax *= 100;
		xmax *= 100;
	}

	return [
		Math.min(ymin, ymax),
		Math.min(xmin, xmax),
		Math.max(ymin, ymax),
		Math.max(xmin, xmax)
	];
}

/**
 * Processes a high-resolution phone photo containing one or more garments / pairs of shoes:
 * 1. Saves original photo.
 * 2. Normalizes orientation and dimensions.
 * 3. Uses Gemini 3.5 Flash-Lite (with fallback to 3.1 Flash-Lite) to detect all items and bounding boxes.
 * 4. Crops each item using sharp.
 * 5. Uses Gemini 3.5 Flash-Lite (with fallback to 3.1 Flash-Lite) to auto-tag each crop.
 * 6. Uses Cloudinary AI to stage each crop onto a pristine studio backdrop with soft shadows.
 */
export async function processMultiGarmentPhoto(photoBuffer: Buffer, filename = 'capture.jpg'): Promise<{
	sourcePhotoId: string;
	originalPath: string;
	candidates: ProcessedGarmentCandidate[];
}> {
	const sourcePhotoId = crypto.randomUUID();
	const safeBasename = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_') || 'capture.jpg';
	const originalFilename = `${sourcePhotoId}_${safeBasename}`;

	// 1. Save original capture locally
	const originalPath = await saveLocalFile('originals', originalFilename, photoBuffer);

	// 2. Auto-rotate according to EXIF and get true dimensions
	const orientedImage = sharp(photoBuffer).rotate();
	const orientedBuffer = await orientedImage.toBuffer();
	const metadata = await sharp(orientedBuffer).metadata();
	const width = metadata.width || 1920;
	const height = metadata.height || 1080;

	// Normalize for AI detection (max 2048px)
	const normalizedBuffer = await sharp(orientedBuffer)
		.resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
		.jpeg({ quality: 85 })
		.toBuffer();

	// 3. Detect bounding boxes with Gemini
	const base64 = normalizedBuffer.toString('base64');
	console.log(`Sending photo (${width}x${height}) to Gemini for garment detection...`);
	const detections = await detectGarmentsInPhoto(base64, 'image/jpeg');
	console.log(`Detected ${detections.length} garments in photo:`, JSON.stringify(detections));

	if (!detections.length) {
		detections.push({
			label: 'Clothing Item',
			bbox: [5, 5, 95, 95]
		});
	}

	// 4. Process each detected bounding box sequentially so Local AI / GPU queue stays responsive
	const results: ProcessedGarmentCandidate[] = [];
	for (let index = 0; index < detections.length; index++) {
		const det = detections[index];
		const tempId = crypto.randomUUID();
		const bbox = extractBoundingBox(det);
		const [ymin, xmin, ymax, xmax] = bbox;

		// Convert percentage to actual pixels
		let cropLeft = Math.max(0, Math.floor((Math.min(xmin, xmax) / 100) * width));
		let cropTop = Math.max(0, Math.floor((Math.min(ymin, ymax) / 100) * height));
		let cropWidth = Math.max(50, Math.min(width - cropLeft, Math.ceil((Math.abs(xmax - xmin) / 100) * width)));
		let cropHeight = Math.max(50, Math.min(height - cropTop, Math.ceil((Math.abs(ymax - ymin) / 100) * height)));

		// Boundary guard
		if (cropLeft + cropWidth > width) cropWidth = width - cropLeft;
		if (cropTop + cropHeight > height) cropHeight = height - cropTop;

		console.log(`Cropping item #${index + 1}: left=${cropLeft}, top=${cropTop}, width=${cropWidth}, height=${cropHeight}`);

		// Extract crop from the properly oriented buffer
		const cropBuffer = await sharp(orientedBuffer)
			.extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
			.jpeg({ quality: 90 })
			.toBuffer();

		// Save crop locally
		const cropFilename = `${sourcePhotoId}_item_${index + 1}.jpg`;
		const cropPath = await saveLocalFile('crops', cropFilename, cropBuffer);
		const cropUrl = `/api/storage/${cropPath}`;

		// Auto-tag with Gemini if not already provided with details from full image detection
		let tagsResult: { name?: string; category?: string; description?: string; fit?: string; tags?: string[] } = {};
		const hasSufficientDetails = Boolean(det.name && det.description && det.tags && det.tags.length > 0);

		if (!hasSufficientDetails) {
			const cropBase64 = cropBuffer.toString('base64');
			try {
				tagsResult = await tagGarmentCrop(cropBase64, 'image/jpeg');
			} catch (tagErr: any) {
				console.warn(`[Pipeline] Auto-tagging crop failed:`, tagErr.message);
			}
		}

		const finalName =
			det.name && det.name !== 'Clothing Item' && det.name !== 'Untitled Garment'
				? det.name
				: tagsResult.name && tagsResult.name !== 'Untitled Garment'
					? tagsResult.name
					: det.label && det.label !== 'Clothing Item'
						? det.label
						: 'Wardrobe Item';

		const finalCategory = (det.category || tagsResult.category || 'tops') as 'tops' | 'bottoms' | 'shoes' | 'outerwear' | 'accessories';
		const finalDesc = det.description || tagsResult.description || '';
		const finalFit = det.fit || tagsResult.fit || undefined;
		const finalTags = (det.tags && det.tags.length ? det.tags : tagsResult.tags) || [];

		let stagedImageUrl = '';
		const isProductShot = Boolean(det.isProductShot);

		if (isProductShot) {
			console.log(`[Pipeline] Item #${index + 1} ("${finalName}") detected as e-commerce / catalog product shot. Using cutout containing all angles as both source and display (bypassing synthetic flat-lay generation).`);
			stagedImageUrl = cropUrl;
		} else {
			// Generate clean e-commerce retail flat-lay (Puter Nano Banana, Local AI, or Pollinations fallback)
			let flatLayBuf: Buffer | null = null;
			const activeEngine = await getActiveImageEngine();

			// Priority 1: Puter Nano Banana (Default)
			if (activeEngine === 'puter') {
				try {
					const available = await hasCloudImageKey();
					if (available) {
						console.log(`[Pipeline] Generating studio flat-lay with Puter / AI Studio (Gemini 3.1 Flash Image)...`);
						flatLayBuf = await generateFlatLayWithPuter(
							{
								name: finalName,
								category: finalCategory,
								description: finalDesc,
								tags: finalTags
							},
							cropBuffer
						);
					}
				} catch (puterErr: any) {
					console.warn(`[Pipeline] Puter / AI Studio flat-lay generation failed (${puterErr.message}), trying fallback...`);
				}
			}

			// Priority 2: Local AI (RTX GPU ComfyUI)
			if (!flatLayBuf && (activeEngine === 'local' || activeEngine === 'puter')) {
				try {
					if (await isLocalAiPreferred()) {
						const health = await checkLocalAiHealth();
						if (health.available && health.capabilities?.includes('generate-flatlay')) {
							console.log(`[Pipeline] Generating studio flat-lay with Local AI (${health.gpu})...`);
							const cropBase64 = cropBuffer.toString('base64');
							const localBuf = await generateFlatLayLocally({
								name: finalName,
								category: finalCategory,
								description: finalDesc,
								tags: finalTags,
								imageBase64: cropBase64
							});
							if (localBuf && localBuf.length > 5000) {
								flatLayBuf = localBuf;
							}
						}
					}
				} catch (localErr: any) {
					console.warn(`[Pipeline] Local AI flat-lay failed or unavailable (${localErr.message})...`);
				}
			}

			// Priority 3: Puter / AI Studio fallback if active was local but local failed
			if (!flatLayBuf && activeEngine === 'local') {
				try {
					const available = await hasCloudImageKey();
					if (available) {
						console.log(`[Pipeline] Falling back to Puter / AI Studio (Gemini 3.1 Flash Image)...`);
						flatLayBuf = await generateFlatLayWithPuter(
							{
								name: finalName,
								category: finalCategory,
								description: finalDesc,
								tags: finalTags
							},
							cropBuffer
						);
					}
				} catch (puterErr: any) {
					console.warn(`[Pipeline] Puter / AI Studio fallback failed:`, puterErr.message);
				}
			}

			// Priority 4: Pollinations FLUX as ultimate free cloud fallback
			if (!flatLayBuf) {
				try {
					flatLayBuf = await generateRetailFlatLay({
						name: finalName,
						category: finalCategory,
						description: finalDesc,
						tags: finalTags
					});
				} catch (fluxErr: any) {
					console.warn('[Pipeline] Pollinations flat-lay generation failed:', fluxErr.message);
				}
			}

			if (flatLayBuf) {
				try {
					stagedImageUrl = await uploadImageToCloudinary(flatLayBuf, 'catalog_studio', `studio_${tempId}`);
					console.log(`[Pipeline] Successfully staged studio flat-lay: ${stagedImageUrl}`);
				} catch (cldErr: any) {
					console.warn('[Pipeline] Cloudinary upload failed for studio flat-lay:', cldErr.message);
				}
			}

			if (!stagedImageUrl) {
				try {
					stagedImageUrl = await stageProductPhoto(cropBuffer, tempId);
				} catch (cldErr) {
					console.warn('Cloudinary staging failed for crop, using crop URL:', cldErr);
					stagedImageUrl = cropUrl;
				}
			}
		}

		results.push({
			tempId,
			name: finalName,
			description: finalDesc,
			category: finalCategory,
			fit: finalFit,
			tags: finalTags,
			stagedImageUrl,
			cropPath,
			cropUrl,
			originalPath,
			bbox,
			isProductShot
		});
	}

	return {
		sourcePhotoId,
		originalPath,
		candidates: results
	};
}
