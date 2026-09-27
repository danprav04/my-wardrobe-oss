import crypto from 'node:crypto';
import { uploadToGradioSpace, callGradioApi, downloadGradioFile } from './gradio';
import { uploadImageToCloudinary } from './cloudinary';
import { saveLocalFile } from '../storage';
import { generateTryOnLocally, checkLocalAiHealth, isLocalAiPreferred } from './local-ai-client';
import { getActiveImageEngine, generateTryOnWithPuter, hasCloudImageKey } from './puter-client';

const LEFFA_SPACE = 'https://franciszzj-leffa.hf.space';
const IDM_VTON_SPACE = 'https://yisol-idm-vton.hf.space';
const FLUX_FILL_SPACE = 'https://black-forest-labs-flux-1-fill-dev.hf.space';

export interface TryOnGarmentSpec {
	buffer: Buffer;
	description: string;
	name?: string;
	category?: string;
	fit?: string | null;
	tags?: string[];
}

export interface TryOnUserProfileSpec {
	height?: string | null;
	bodyType?: string | null;
	fitPreference?: string | null;
}

export interface TryOnRequest {
	portraitBuffer: Buffer;
	userProfile?: TryOnUserProfileSpec;
	topGarment?: TryOnGarmentSpec;
	bottomGarment?: TryOnGarmentSpec;
	shoes?: TryOnGarmentSpec;
}

/**
 * Executes clothing virtual try-on using Leffa or IDM-VTON Space on Hugging Face.
 */
async function executeClothingVton(
	personBuffer: Buffer,
	garmentBuffer: Buffer,
	garmentType: 'upper_body' | 'lower_body',
	description: string
): Promise<Buffer> {
	const modelType = garmentType === 'lower_body' ? 'dress_code' : 'viton_hd';

	try {
		// Attempt 1: Leffa Space (supports upper_body with viton_hd, and lower_body with dress_code)
		const personPath = await uploadToGradioSpace(LEFFA_SPACE, personBuffer, 'person.jpg');
		const garmentPath = await uploadToGradioSpace(LEFFA_SPACE, garmentBuffer, 'garment.jpg');

		console.log(`[TryOn] Calling Leffa (${modelType}, ${garmentType})...`);
		// Leffa parameters: [person_img, garment_img, accelerate, steps, guidance, seed, model_type, garment_type, repaint]
		const result = await callGradioApi(LEFFA_SPACE, 'leffa_predict_vt', [
			{ path: personPath },
			{ path: garmentPath },
			false, // Accelerate Reference UNet
			30, // Inference Steps
			2.5, // Guidance Scale
			42, // Random Seed
			modelType, // Model Type: 'viton_hd' for tops, 'dress_code' for bottoms
			garmentType, // Garment Type: 'upper_body' | 'lower_body'
			false // Repaint Mode
		]);

		const outputRef = Array.isArray(result) ? result[0] : result;
		return await downloadGradioFile(LEFFA_SPACE, outputRef);
	} catch (err: any) {
		console.warn(`Leffa try-on attempt failed (${err.message})`);

		// IDM-VTON only supports upper-body garments. Do NOT send lower-body to IDM-VTON as it wraps pants over the torso.
		if (garmentType === 'lower_body') {
			console.warn('[TryOn] IDM-VTON does not support lower_body garments. Keeping current canvas.');
			return personBuffer;
		}

		console.log('[TryOn] Trying IDM-VTON fallback for upper_body...');
		// Fallback for upper-body: IDM-VTON Space
		const personPath = await uploadToGradioSpace(IDM_VTON_SPACE, personBuffer, 'person.jpg');
		const garmentPath = await uploadToGradioSpace(IDM_VTON_SPACE, garmentBuffer, 'garment.jpg');

		const result = await callGradioApi(IDM_VTON_SPACE, 'tryon', [
			{
				background: { path: personPath },
				layers: [],
				composite: null
			},
			{ path: garmentPath },
			description || `${garmentType} casual garment`,
			true, // auto-mask
			false, // crop
			30, // denoise steps
			42 // seed
		]);

		const outputRef = Array.isArray(result) ? result[0] : result;
		return await downloadGradioFile(IDM_VTON_SPACE, outputRef);
	}
}

/**
 * Inpaints shoes onto the feet in the clothing-composited portrait using FLUX.1-Fill.
 */
async function executeShoeInpainting(
	dressedPersonBuffer: Buffer,
	shoeDescription: string,
	shoeTags: string[]
): Promise<Buffer> {
	try {
		const prompt = `${shoeDescription || 'stylish sneakers'}, worn on feet, standing firmly on floor, photorealistic footwear texture, realistic ground contact and cast shadows`;

		const personPath = await uploadToGradioSpace(FLUX_FILL_SPACE, dressedPersonBuffer, 'person.jpg');

		// Calls FLUX.1-Fill with automatic foot area inpainting prompt
		const result = await callGradioApi(FLUX_FILL_SPACE, 'infer', [
			{
				background: { path: personPath },
				layers: [],
				composite: null
			},
			prompt,
			0, // seed
			true, // randomize seed
			1024, // width
			1024, // height
			50, // guidance scale
			28 // steps
		]);

		const outputRef = Array.isArray(result) ? result[0] : result;
		return await downloadGradioFile(FLUX_FILL_SPACE, outputRef);
	} catch (err: any) {
		console.warn('Shoe inpainting failed or queued out, returning dressed portrait:', err.message);
		return dressedPersonBuffer;
	}
}

/**
 * Orchestrates the full two-step virtual try-on pipeline:
 * 1. Dresses the person in upper and lower clothing.
 * 2. Inpaints and renders the selected footwear on feet.
 * 3. Saves the resulting composite and returns the accessible URL.
 */
export async function runVirtualTryOn(req: TryOnRequest, outfitId: string): Promise<string> {
	const activeEngine = await getActiveImageEngine();
	let resultBuffer: Buffer | null = null;

	// Route 1: Puter / AI Studio (Default Cloud Engine)
	if (activeEngine === 'puter') {
		try {
			const available = await hasCloudImageKey();
			if (available) {
				console.log('[TryOn] Routing to Puter / AI Studio (Gemini 3.1 Flash Image)...');
				resultBuffer = await generateTryOnWithPuter(req);
			}
		} catch (puterErr: any) {
			console.warn(`[TryOn] Puter / AI Studio try-on failed (${puterErr.message}), trying local/cloud fallback...`);
		}
	}

	// Route 2: Local AI GPU Engine (RTX ComfyUI Qwen-Image-2.1)
	if (!resultBuffer && (activeEngine === 'local' || activeEngine === 'puter')) {
		try {
			const health = await checkLocalAiHealth();
			if (health.available && health.capabilities?.includes('tryon')) {
				console.log(`[TryOn] Routing to Local AI GPU Engine (Qwen-Image-2.1 on ${health.gpu})...`);
				const localResultBuffer = await generateTryOnLocally({
					portraitBuffer: req.portraitBuffer,
					userProfile: req.userProfile,
					topGarment: req.topGarment,
					bottomGarment: req.bottomGarment,
					shoes: req.shoes ? { buffer: req.shoes.buffer, description: req.shoes.description, name: req.shoes.name } : undefined
				});

				if (localResultBuffer && localResultBuffer.length > 5000) {
					resultBuffer = localResultBuffer;
				}
			}
		} catch (localErr: any) {
			console.warn(`[TryOn] Local AI try-on failed (${localErr.message})...`);
		}
	}

	// Route 3: If active was Local but local failed, try Puter / AI Studio
	if (!resultBuffer && activeEngine === 'local') {
		try {
			const available = await hasCloudImageKey();
			if (available) {
				console.log('[TryOn] Falling back to Puter / AI Studio (Gemini 3.1 Flash Image)...');
				resultBuffer = await generateTryOnWithPuter(req);
			}
		} catch (puterErr: any) {
			console.warn(`[TryOn] Puter / AI Studio fallback failed:`, puterErr.message);
		}
	}

	// If Puter or Local produced a composite image, save and return
	if (resultBuffer && resultBuffer.length > 5000) {
		console.log(`[TryOn] Engine composite generation succeeded (${resultBuffer.length} bytes)`);
		const uniqueSuffix = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
		const filename = `tryon_${outfitId || 'preview'}_${uniqueSuffix}.jpg`;
		const publicId = `tryon_${outfitId || 'preview'}_${uniqueSuffix}`;
		const localPath = await saveLocalFile('tryons', filename, resultBuffer);

		try {
			const cldUrl = await uploadImageToCloudinary(resultBuffer, 'tryons', publicId);
			return cldUrl;
		} catch (cldErr: any) {
			console.warn('[TryOn] Cloudinary upload fallback to local URL:', cldErr.message);
			return `/api/storage/${localPath}`;
		}
	}

	// Route 4: Fallback to Cloud Leffa / IDM-VTON Gradio pipeline
	console.log('[TryOn] Falling back to Cloud Leffa / IDM-VTON Gradio pipeline...');
	let currentCanvas = req.portraitBuffer;

	// Step 1a: Apply top garment if present
	if (req.topGarment) {
		console.log('Running virtual try-on for top garment...');
		currentCanvas = await executeClothingVton(
			currentCanvas,
			req.topGarment.buffer,
			'upper_body',
			req.topGarment.description
		);
	}

	// Step 1b: Apply bottom garment if present
	if (req.bottomGarment) {
		console.log('Running virtual try-on for bottom garment...');
		currentCanvas = await executeClothingVton(
			currentCanvas,
			req.bottomGarment.buffer,
			'lower_body',
			req.bottomGarment.description
		);
	}

	// Step 2: Apply shoes onto feet if present
	if (req.shoes) {
		console.log('Running shoe inpainting for footwear...');
		currentCanvas = await executeShoeInpainting(
			currentCanvas,
			req.shoes.description,
			req.shoes.tags || []
		);
	}

	// Save locally in storage with unique identifier
	const uniqueSuffix = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
	const filename = `tryon_${outfitId || 'preview'}_${uniqueSuffix}.jpg`;
	const publicId = `tryon_${outfitId || 'preview'}_${uniqueSuffix}`;
	const localPath = await saveLocalFile('tryons', filename, currentCanvas);

	// Also upload to Cloudinary for CDN delivery if available
	try {
		const cldUrl = await uploadImageToCloudinary(currentCanvas, 'tryons', publicId);
		return cldUrl;
	} catch (e) {
		console.warn('Cloudinary tryon upload fallback to local URL:', e);
		return `/api/storage/${localPath}`;
	}
}
