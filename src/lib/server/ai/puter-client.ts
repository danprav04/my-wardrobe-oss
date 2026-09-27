import { createRequire } from 'node:module';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { appSettings } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { generateFlatLayWithAiStudio, generateTryOnWithAiStudio, hasGeminiImageKey } from './gemini-image';

const require = createRequire(import.meta.url);

export type ImageGenEngine = 'puter' | 'local' | 'cloud';

/**
 * Checks whether either a Puter Auth Token or Google AI Studio Image Key is available.
 */
export async function hasCloudImageKey(): Promise<boolean> {
	const tokens = await getPuterTokens();
	if (tokens.length > 0) return true;
	return await hasGeminiImageKey();
}

export interface PuterStatusResult {
	available: boolean;
	username?: string;
	latencyMs: number;
	model: string;
	poolSize?: number;
	error?: string;
}

export interface PuterTryOnRequest {
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

export interface PuterFlatLaySpec {
	name: string;
	category: string;
	description?: string;
	tags?: string[];
}

const NANO_BANANA_MODEL = 'gemini-3.1-flash-image-preview';

let currentTokenIndex = 0;

/**
 * Retrieves all configured Puter Auth Tokens (supporting comma/newline separated token pools
 * from environment variables), deduplicated and validated.
 */
export async function getPuterTokens(): Promise<string[]> {
	const tokenSet = new Set<string>();

	// From environment variables (both PUTER_AUTH_TOKENS and PUTER_AUTH_TOKEN)
	const envSources = [
		env.PUTER_AUTH_TOKENS,
		process.env.PUTER_AUTH_TOKENS,
		env.PUTER_AUTH_TOKEN,
		process.env.PUTER_AUTH_TOKEN
	].filter(Boolean) as string[];

	for (const raw of envSources) {
		raw
			.split(/[\r\n,;]+/)
			.map((t) => t.trim())
			.filter((t) => t.length > 20)
			.forEach((t) => tokenSet.add(t));
	}

	return Array.from(tokenSet);
}

/**
 * Retrieves the primary Puter Auth Token or comma-separated token pool string.
 */
export async function getPuterToken(): Promise<string> {
	const tokens = await getPuterTokens();
	return tokens.join(', ');
}

/**
 * Retrieves the active Image Generation Engine. Defaults to 'puter'.
 */
export async function getActiveImageEngine(): Promise<ImageGenEngine> {
	try {
		const [setting] = await db
			.select()
			.from(appSettings)
			.where(eq(appSettings.key, 'image_gen_engine'));
		if (setting && setting.value.trim()) {
			return setting.value.trim() as ImageGenEngine;
		}
	} catch {
		// Fallback to env
	}

	const fromEnv = (env.IMAGE_GEN_ENGINE || process.env.IMAGE_GEN_ENGINE || 'puter').trim().toLowerCase();
	if (fromEnv === 'local' || fromEnv === 'cloud') {
		return fromEnv;
	}
	return 'puter';
}

/**
 * Sets the active Image Generation Engine ('puter' | 'local' | 'cloud').
 */
export async function setActiveImageEngine(engine: ImageGenEngine): Promise<void> {
	await db
		.insert(appSettings)
		.values({ key: 'image_gen_engine', value: engine })
		.onConflictDoUpdate({
			target: appSettings.key,
			set: { value: engine }
		});
}

/**
 * Instantiates and returns the Puter client initialized with an auth token.
 */
export async function getPuterInstance(customToken?: string) {
	let token = customToken?.trim();
	if (!token) {
		const tokens = await getPuterTokens();
		token = tokens[0];
	} else if (token.includes(',') || token.includes('\n')) {
		token = token.split(/[\r\n,;]+/)[0].trim();
	}
	if (!token) {
		throw new Error('Puter Auth Token is missing. Please set PUTER_AUTH_TOKENS or PUTER_AUTH_TOKEN in your environment.');
	}

	const { init } = require('@heyputer/puter.js/src/init.cjs');
	return init(token);
}

/**
 * Pings Puter to verify authentication and model availability across the configured token pool.
 */
export async function checkPuterStatus(targetToken?: string): Promise<PuterStatusResult> {
	const startTime = Date.now();
	try {
		const rawTokens = targetToken
			? targetToken.split(/[\r\n,;]+/).map((t) => t.trim()).filter((t) => t.length > 20)
			: await getPuterTokens();

		if (rawTokens.length === 0) {
			return {
				available: false,
				latencyMs: 0,
				model: NANO_BANANA_MODEL,
				poolSize: 0,
				error: 'No Puter Auth Token configured'
			};
		}

		const validUsers: string[] = [];
		let firstError: string | null = null;

		for (const tok of rawTokens) {
			try {
				const puter = await getPuterInstance(tok);
				const user = await puter.auth.getUser();
				if (user && user.code !== 'not_found' && !user.error) {
					validUsers.push(user.username || user.name || 'Puter User');
				} else {
					if (!firstError) firstError = user?.message || 'Invalid Puter token';
				}
			} catch (err: any) {
				if (!firstError) firstError = err.message || 'Failed to authenticate';
			}
		}

		const latencyMs = Date.now() - startTime;

		if (validUsers.length === 0) {
			return {
				available: false,
				latencyMs,
				model: NANO_BANANA_MODEL,
				poolSize: rawTokens.length,
				error: firstError || 'Invalid or expired Puter Auth Token'
			};
		}

		const displayName = validUsers.length === 1
			? validUsers[0]
			: `${validUsers.length} accounts active (${validUsers.join(', ')})`;

		return {
			available: true,
			username: displayName,
			latencyMs,
			model: NANO_BANANA_MODEL,
			poolSize: validUsers.length
		};
	} catch (err: any) {
		return {
			available: false,
			latencyMs: Date.now() - startTime,
			model: NANO_BANANA_MODEL,
			error: err.message || 'Failed to connect to Puter'
		};
	}
}

/**
 * Detects whether an image buffer is PNG, JPEG, or WebP by reading magic bytes.
 */
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
 * Helper to convert an image Buffer to a Base64 Data URI with dynamic MIME detection.
 */
export function bufferToDataUri(buf: Buffer, mime?: string): string {
	const resolvedMime = mime || detectMimeType(buf);
	return `data:${resolvedMime};base64,${buf.toString('base64')}`;
}

/**
 * Helper to convert Puter txt2img response (data URI or URL string/object) to a Node Buffer.
 */
async function puterResultToBuffer(res: any): Promise<Buffer> {
	const src = res?.src || res;
	if (typeof src !== 'string') {
		throw new Error('Puter image generation did not return a valid image string or URL');
	}

	if (src.startsWith('data:')) {
		const base64Data = src.split(',')[1] || src;
		return Buffer.from(base64Data, 'base64');
	}

	if (src.startsWith('http://') || src.startsWith('https://')) {
		const fetchRes = await fetch(src);
		if (!fetchRes.ok) {
			throw new Error(`Failed to fetch generated image from Puter CDN: ${fetchRes.statusText}`);
		}
		const arrayBuf = await fetchRes.arrayBuffer();
		return Buffer.from(arrayBuf);
	}

	throw new Error('Unsupported image format returned from Puter');
}

export { buildNanoBananaFlatLayPrompt, type FlatLayVisualSpec } from './flatlay-prompt';
import { buildNanoBananaFlatLayPrompt } from './flatlay-prompt';

/**
 * Generates a clean e-commerce studio flat-lay using Puter Nano Banana (Gemini 3.1 Flash Image).
 * Cycles through available Puter tokens and falls back to Google AI Studio API key if Puter credits are exhausted.
 */
export async function generateFlatLayWithPuter(
	spec: PuterFlatLaySpec,
	cropBuffer: Buffer
): Promise<Buffer> {
	const tokens = await getPuterTokens();
	let lastPuterError: any = null;

	// 1. Try Puter tokens with rotation & auto-failover
	if (tokens.length > 0) {
		for (let attempt = 0; attempt < tokens.length; attempt++) {
			const activeIdx = (currentTokenIndex + attempt) % tokens.length;
			const token = tokens[activeIdx];
			try {
				const puter = await getPuterInstance(token);
				const cropDataUri = bufferToDataUri(cropBuffer, 'image/jpeg');
				const prompt = buildNanoBananaFlatLayPrompt(spec);

				console.log(`[Puter Nano Banana] Generating retail flat-lay for "${spec.name}" (Token #${activeIdx + 1}/${tokens.length})...`);
				const startTime = Date.now();

				const result = await puter.ai.txt2img(prompt, {
					model: NANO_BANANA_MODEL,
					input_image: cropDataUri,
					input_image_mime_type: 'image/jpeg'
				});

				const buffer = await puterResultToBuffer(result);
				console.log(`[Puter Nano Banana] Flat-lay generated successfully in ${Date.now() - startTime}ms (${buffer.length} bytes)`);
				currentTokenIndex = (currentTokenIndex + 1) % tokens.length;
				return buffer;
			} catch (err: any) {
				console.warn(`[Puter Nano Banana] Token #${activeIdx + 1} failed or exhausted (${err.message || err.code || err})`);
				lastPuterError = err;
			}
		}
	}

	// 2. Fallback: Paid Google AI Studio API Key
	try {
		console.log(`[Flat-Lay Fallback] Puter unavailable or credits depleted (${lastPuterError?.message || 'no Puter tokens'}). Routing to paid Google AI Studio API key...`);
		return await generateFlatLayWithAiStudio(spec, cropBuffer);
	} catch (aiStudioErr: any) {
		console.warn(`[Flat-Lay Fallback] Google AI Studio generation failed:`, aiStudioErr.message);
		throw lastPuterError || aiStudioErr;
	}
}

/**
 * Runs Virtual Try-On using Puter Nano Banana with multi-image conditioning.
 * Cycles through Puter tokens and falls back to Google AI Studio API key if Puter credits are exhausted.
 */
export async function generateTryOnWithPuter(req: PuterTryOnRequest): Promise<Buffer> {
	const tokens = await getPuterTokens();
	let lastPuterError: any = null;

	// 1. Try Puter tokens with rotation & auto-failover
	if (tokens.length > 0) {
		for (let attempt = 0; attempt < tokens.length; attempt++) {
			const activeIdx = (currentTokenIndex + attempt) % tokens.length;
			const token = tokens[activeIdx];
			try {
				const puter = await getPuterInstance(token);

				const inputImages: string[] = [];
				const garmentDescriptions: string[] = [];

				inputImages.push(bufferToDataUri(req.portraitBuffer));
				let imgIndex = 2;

				if (req.topGarment) {
					inputImages.push(bufferToDataUri(req.topGarment.buffer));
					const fitTag = req.topGarment.fit ? ` [Fit/Cut: ${req.topGarment.fit}]` : '';
					const title = req.topGarment.name ? `"${req.topGarment.name}" - ` : '';
					garmentDescriptions.push(`Reference Image ${imgIndex}: Upper body top garment (${title}${req.topGarment.description || 'casual top'}${fitTag})`);
					imgIndex++;
				}

				if (req.bottomGarment) {
					inputImages.push(bufferToDataUri(req.bottomGarment.buffer));
					const fitTag = req.bottomGarment.fit ? ` [Fit/Cut: ${req.bottomGarment.fit}]` : '';
					const title = req.bottomGarment.name ? `"${req.bottomGarment.name}" - ` : '';
					garmentDescriptions.push(`Reference Image ${imgIndex}: Lower body bottom garment (${title}${req.bottomGarment.description || 'trousers/pants'}${fitTag})`);
					imgIndex++;
				}

				if (req.shoes) {
					inputImages.push(bufferToDataUri(req.shoes.buffer));
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

				const prompt = [
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

				console.log(`[Puter Nano Banana] Executing Virtual Try-On with ${inputImages.length} images (Token #${activeIdx + 1}/${tokens.length})...`);
				const startTime = Date.now();

				const result = await puter.ai.txt2img(prompt, {
					model: NANO_BANANA_MODEL,
					input_images: inputImages
				});

				const buffer = await puterResultToBuffer(result);
				console.log(`[Puter Nano Banana] Virtual Try-On completed successfully in ${Date.now() - startTime}ms (${buffer.length} bytes)`);
				currentTokenIndex = (currentTokenIndex + 1) % tokens.length;
				return buffer;
			} catch (err: any) {
				console.warn(`[Puter Nano Banana] Token #${activeIdx + 1} failed or exhausted (${err.message || err.code || err})`);
				lastPuterError = err;
			}
		}
	}

	// 2. Fallback: Paid Google AI Studio API Key
	try {
		console.log(`[TryOn Fallback] Puter unavailable or credits depleted (${lastPuterError?.message || 'no Puter tokens'}). Routing to paid Google AI Studio API key...`);
		return await generateTryOnWithAiStudio(req);
	} catch (aiStudioErr: any) {
		console.warn(`[TryOn Fallback] Google AI Studio try-on failed:`, aiStudioErr.message);
		throw lastPuterError || aiStudioErr;
	}
}
