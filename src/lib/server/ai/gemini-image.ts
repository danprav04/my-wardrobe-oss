import { env } from '$env/dynamic/private';
import { buildNanoBananaFlatLayPrompt } from './flatlay-prompt';

const MODEL_NANO_BANANA = 'gemini-3.1-flash-image-preview';

/**
 * Retrieves the Google AI Studio Image API key from environment variables.
 * Falls back from GEMINI_IMAGE_API_KEY to GEMINI_API_KEY.
 */
export async function getGeminiImageApiKey(): Promise<string> {
	return (
		env.GEMINI_IMAGE_API_KEY ||
		process.env.GEMINI_IMAGE_API_KEY ||
		env.GEMINI_API_KEY ||
		process.env.GEMINI_API_KEY ||
		''
	).trim();
}

/**
 * Checks if a Google AI Studio Image API key is configured.
 */
export async function hasGeminiImageKey(): Promise<boolean> {
	const key = await getGeminiImageApiKey();
	return Boolean(key);
}

export interface GeminiFlatLaySpec {
	name: string;
	category: string;
	description?: string;
	tags?: string[];
}

export interface GeminiTryOnRequest {
	portraitBuffer: Buffer;
	userProfile?: {
		height?: string | null;
		bodyType?: string | null;
		fitPreference?: string | null;
	};
	topGarment?: { buffer: Buffer; description: string; name?: string; fit?: string | null; tags?: string[] };
	bottomGarment?: { buffer: Buffer; description: string; name?: string; fit?: string | null; tags?: string[] };
	shoes?: { buffer: Buffer; description: string; name?: string; tags?: string[] };
}

/**
 * Generates an e-commerce catalog studio flat-lay directly using Google AI Studio API.
 * Uses Nano Banana (gemini-3.1-flash-image-preview) with responseModalities: ["TEXT", "IMAGE"].
 */
export async function generateFlatLayWithAiStudio(
	spec: GeminiFlatLaySpec,
	cropBuffer: Buffer
): Promise<Buffer> {
	const apiKey = await getGeminiImageApiKey();
	if (!apiKey) throw new Error('GEMINI_IMAGE_API_KEY or GEMINI_API_KEY is not configured');
	const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NANO_BANANA}:generateContent?key=${apiKey}`;

	const promptText = buildNanoBananaFlatLayPrompt(spec);

	console.log(`[Google AI Studio] Generating retail flat-lay with ${MODEL_NANO_BANANA}...`);
	const startTime = Date.now();

	const body = {
		contents: [
			{
				parts: [
					{ text: promptText },
					{
						inlineData: {
							mimeType: 'image/jpeg',
							data: cropBuffer.toString('base64')
						}
					}
				]
			}
		],
		generationConfig: {
			responseModalities: ['TEXT', 'IMAGE']
		}
	};

	const res = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});

	if (!res.ok) {
		const errText = await res.text();
		throw new Error(`Google AI Studio API error (${res.status}): ${errText}`);
	}

	const data = await res.json();
	const parts = data.candidates?.[0]?.content?.parts || [];
	const imagePart = parts.find((p: any) => p.inlineData?.data);

	if (!imagePart || !imagePart.inlineData?.data) {
		throw new Error('Google AI Studio did not return an image in candidate parts');
	}

	const buffer = Buffer.from(imagePart.inlineData.data, 'base64');
	console.log(`[Google AI Studio] Flat-lay generated successfully in ${Date.now() - startTime}ms (${buffer.length} bytes)`);
	return buffer;
}

export function detectMimeType(buf: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' {
	if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
		return 'image/png';
	}
	if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) {
		return 'image/jpeg';
	}
	if (buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) {
		return 'image/webp';
	}
	return 'image/jpeg';
}

/**
 * Runs Virtual Try-On directly using Google AI Studio API.
 * Uses Nano Banana (gemini-3.1-flash-image-preview) with multi-image conditioning.
 */
export async function generateTryOnWithAiStudio(req: GeminiTryOnRequest): Promise<Buffer> {
	const apiKey = await getGeminiImageApiKey();
	if (!apiKey) throw new Error('GEMINI_IMAGE_API_KEY or GEMINI_API_KEY is not configured');
	const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NANO_BANANA}:generateContent?key=${apiKey}`;

	const parts: any[] = [];
	const garmentDescriptions: string[] = [];

	// 1. Person portrait
	parts.push({
		inlineData: {
			mimeType: detectMimeType(req.portraitBuffer),
			data: req.portraitBuffer.toString('base64')
		}
	});

	let imgIndex = 2;

	// 2. Garments
	if (req.topGarment) {
		parts.push({
			inlineData: {
				mimeType: detectMimeType(req.topGarment.buffer),
				data: req.topGarment.buffer.toString('base64')
			}
		});
		const fitTag = req.topGarment.fit ? ` [Fit/Cut: ${req.topGarment.fit}]` : '';
		const title = req.topGarment.name ? `"${req.topGarment.name}" - ` : '';
		garmentDescriptions.push(`Reference Image ${imgIndex}: Upper body top garment (${title}${req.topGarment.description || 'casual top'}${fitTag})`);
		imgIndex++;
	}

	if (req.bottomGarment) {
		parts.push({
			inlineData: {
				mimeType: detectMimeType(req.bottomGarment.buffer),
				data: req.bottomGarment.buffer.toString('base64')
			}
		});
		const fitTag = req.bottomGarment.fit ? ` [Fit/Cut: ${req.bottomGarment.fit}]` : '';
		const title = req.bottomGarment.name ? `"${req.bottomGarment.name}" - ` : '';
		garmentDescriptions.push(`Reference Image ${imgIndex}: Lower body bottom garment (${title}${req.bottomGarment.description || 'trousers/pants'}${fitTag})`);
		imgIndex++;
	}

	if (req.shoes) {
		parts.push({
			inlineData: {
				mimeType: detectMimeType(req.shoes.buffer),
				data: req.shoes.buffer.toString('base64')
			}
		});
		const title = req.shoes.name ? `"${req.shoes.name}" - ` : '';
		garmentDescriptions.push(`Reference Image ${imgIndex}: Footwear/shoes (${title}${req.shoes.description || 'shoes'})`);
		imgIndex++;
	}

	const isWideBottom =
		(req.bottomGarment?.fit && ['wide-leg', 'wide', 'baggy', 'relaxed'].some((f) => req.bottomGarment!.fit!.includes(f))) ||
		(req.bottomGarment?.name && /wide|baggy|relaxed/i.test(req.bottomGarment.name)) ||
		(req.bottomGarment?.description && /wide|baggy|relaxed/i.test(req.bottomGarment.description));

	const isOversizedTop =
		(req.topGarment?.fit && ['oversized', 'boxy', 'relaxed'].some((f) => req.topGarment!.fit!.includes(f))) ||
		(req.topGarment?.name && /oversized|boxy|relaxed/i.test(req.topGarment.name));

	const fitRules = [
		'CRITICAL FIT & SILHOUETTE PRESERVATION (HOW THE CLOTHES SIT ON THE BODY):',
		'- You MUST faithfully replicate how each garment sits, hangs, and drapes relative to the person’s body according to its specific cut and silhouette in the reference images and description.',
		isWideBottom
			? '- LOWER BODY (WIDE-LEG / BAGGY FIT MANDATORY): The bottom pants/jeans have a wide-leg / baggy cut. DO NOT cling to or shrink-wrap the legs! The pant legs MUST hang wide, straight, and loose from the hips and thighs all the way down, maintaining generous fabric volume, wide leg openings, and authentic loose drape that sits away from the calves/shins, pooling and stacking naturally over the footwear.'
			: '- LOWER BODY FIT: Accurately follow the pants cut from the reference image. If straight or relaxed, fall without tight constriction. If slim, follow leg lines naturally.',
		isOversizedTop
			? '- UPPER BODY (OVERSIZED / BOXY FIT MANDATORY): The top has an oversized or boxy cut. Render dropped shoulder seams, loose chest drape, and wider arm openings that hang freely away from the body without clinging tightly.'
			: '- UPPER BODY FIT: Render authentic torso and shoulder fit matching the garment cut.',
		'- DO NOT homogenize all clothing into standard slim or skin-tight fit. Respect the authentic volume, leg width, and relaxed silhouette of each piece.',
		req.userProfile?.height || req.userProfile?.bodyType
			? `- SUBJECT PROPORTIONS: The subject person has ${req.userProfile.bodyType || 'proportional'} build${req.userProfile.height ? ` and height ${req.userProfile.height}` : ''}. Scale and drape the clothing accurately to their stature.`
			: ''
	].filter(Boolean).join(' ');

	const promptText = [
		'High-fashion photorealistic virtual try-on editorial.',
		'Reference Image 1 shows the target subject person.',
		'The subsequent reference images show the exact wardrobe items to fit onto the person:',
		garmentDescriptions.join('; ') + '.',
		'Task: Dress the subject person in the specified clothing pieces. Realistically drape and fit the apparel onto their body, chest volume, and posture with natural fabric wrinkles, seamless neckline transition, and correct limb draping.',
		fitRules,
		'Footwear Fidelity: You MUST faithfully reproduce the exact colors, soles, accents, brand styling, and design of the footwear shown in the footwear reference image. Do NOT alter footwear color or replace with generic black/white shoes.',
		'Identity preservation: Absolutely preserve the subject person’s exact face, facial features, eyeglasses, hairstyle, beard, smile, skin tone, and body proportions from Reference Image 1.',
		'Background preservation: Keep the original room or background from Reference Image 1 intact.',
		'Textile fidelity: Faithfully retain the colors, patterns, denim wash/fade, graphics, and materials of the garments shown in the clothing reference images.'
	].join(' ');

	// Prepend prompt text part
	parts.unshift({ text: promptText });

	console.log(`[Google AI Studio] Executing Virtual Try-On with ${parts.length - 1} images...`);
	const startTime = Date.now();

	const body = {
		contents: [{ parts }],
		generationConfig: {
			responseModalities: ['TEXT', 'IMAGE']
		}
	};

	const res = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});

	if (!res.ok) {
		const errText = await res.text();
		throw new Error(`Google AI Studio API error (${res.status}): ${errText}`);
	}

	const data = await res.json();
	const resParts = data.candidates?.[0]?.content?.parts || [];
	const imagePart = resParts.find((p: any) => p.inlineData?.data);

	if (!imagePart || !imagePart.inlineData?.data) {
		throw new Error('Google AI Studio did not return an image in candidate parts');
	}

	const buffer = Buffer.from(imagePart.inlineData.data, 'base64');
	console.log(`[Google AI Studio] Virtual Try-On completed successfully in ${Date.now() - startTime}ms (${buffer.length} bytes)`);
	return buffer;
}
