import { saveLocalFile, readLocalFile } from '../storage';
import { removeBackgroundWithCloudinary } from './cloudinary';
import { removeBackgroundLocally } from './local-ai-client';
import { uploadToGradioSpace, callGradioApi, downloadGradioFile } from './gradio';
import { env } from '$env/dynamic/private';

const HF_BG_REMOVAL_SPACE = 'https://ysharma-text-behind-image-ac049ff.hf.space';

/**
 * Strips bedding, flooring, or environmental background from a raw garment crop,
 * returning a clean transparent PNG cutout.
 *
 * Provider Priority:
 * 1. Cloudinary AI (First choice: effect: 'background_removal')
 * 2. Local AI (GPU/CPU Rembg fallback)
 * 3. Hugging Face BiRefNet (ysharma/text-behind-image)
 * 4. Raw crop buffer fallback
 *
 * Caches the result in `data/cutouts/` so each garment is only isolated once.
 */
export async function getCleanGarmentCutout(garmentId: string, rawCropBuffer: Buffer): Promise<Buffer> {
	const filename = `cutout_${garmentId}.png`;
	const relativePath = `cutouts/${filename}`;

	// 1. Check local cache first
	try {
		const cached = await readLocalFile(relativePath);
		if (cached && cached.length > 1000) {
			console.log(`[Cutout] Using cached cutout for garment ${garmentId} (${cached.length} bytes)`);
			return cached;
		}
	} catch {
		// Not cached yet, proceed to isolation
	}

	console.log(`[Cutout] Isolating garment ${garmentId} from background...`);
	let cleanBuffer: Buffer | null = null;

	// 2. First Choice: Cloudinary AI Background Removal
	const hasCloudinary = Boolean(env.CLOUDINARY_URL || process.env.CLOUDINARY_URL);
	if (hasCloudinary) {
		try {
			console.log(`[Cutout] First Choice: Calling Cloudinary AI Background Removal for garment ${garmentId}...`);
			const cldRes = await removeBackgroundWithCloudinary(rawCropBuffer, garmentId);
			if (cldRes && cldRes.buffer && cldRes.buffer.length > 1000) {
				cleanBuffer = cldRes.buffer;
				console.log(`[Cutout] Cloudinary AI successfully isolated garment ${garmentId} (${cleanBuffer.length} bytes) -> ${cldRes.url}`);
			}
		} catch (cldErr: any) {
			console.warn(`[Cutout] Cloudinary AI background removal failed (${cldErr.message}), falling back to Local AI / BiRefNet...`);
		}
	}

	// 3. Fallback 1: Local AI (Rembg GPU/CPU - ultra fast <1s, 100% offline)
	if (!cleanBuffer) {
		try {
			console.log(`[Cutout] Fallback 1: Calling Local AI (Rembg) for garment ${garmentId}...`);
			cleanBuffer = await removeBackgroundLocally(rawCropBuffer);
			console.log(`[Cutout] Local AI isolated garment ${garmentId} (${cleanBuffer.length} bytes)`);
		} catch (localErr: any) {
			console.warn(`[Cutout] Local background removal unavailable or failed: ${localErr.message}`);
		}
	}

	// 4. Fallback 2: Free BiRefNet Gradio Space (ysharma/text-behind-image)
	if (!cleanBuffer) {
		try {
			console.log(`[Cutout] Fallback 2: Calling BiRefNet Gradio Space for garment ${garmentId}...`);
			const uploadedPath = await uploadToGradioSpace(HF_BG_REMOVAL_SPACE, rawCropBuffer, `${garmentId}.jpg`);
			const result = await callGradioApi(HF_BG_REMOVAL_SPACE, 'remove_background', [{ path: uploadedPath }], 60000);
			const outputRef = Array.isArray(result) ? result[0] : result;
			cleanBuffer = await downloadGradioFile(HF_BG_REMOVAL_SPACE, outputRef);
			console.log(`[Cutout] BiRefNet isolated garment ${garmentId} (${cleanBuffer.length} bytes)`);
		} catch (gradioErr: any) {
			console.warn(`[Cutout] Gradio background removal failed: ${gradioErr.message}`);
		}
	}

	// 5. Ultimate fallback to raw crop buffer if all fail
	const finalBuffer = cleanBuffer || rawCropBuffer;

	// 6. Cache for future try-on runs
	try {
		await saveLocalFile('cutouts', filename, finalBuffer);
	} catch (cacheErr: any) {
		console.warn(`[Cutout] Failed to cache cutout: ${cacheErr.message}`);
	}

	return finalBuffer;
}
