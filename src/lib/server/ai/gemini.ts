import { env } from '$env/dynamic/private';
import { 
	checkLocalAiHealth, 
	isLocalAiPreferred, 
	detectGarmentsLocally, 
	tagGarmentLocally,
	type LocalAiDetection,
	type LocalAiTagResult
} from './local-ai-client';

export const PRIMARY_GEMINI_MODEL = 'gemini-3.5-flash-lite';
export const FALLBACK_GEMINI_MODEL = 'gemini-3.1-flash-lite';

/**
 * Retrieves the standard Google Gemini API key for vision detection, auto-tagging, and outfit stylist.
 * NOTE: Strictly uses GEMINI_API_KEY. GEMINI_IMAGE_API_KEY is reserved exclusively for Nano Banana
 * (gemini-3.1-flash-image-preview) and is NEVER used for detection, tagging, or text tasks.
 */
function getApiKey(): string {
	const key = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
	if (!key) throw new Error('GEMINI_API_KEY is not configured');
	return key;
}

export interface BoundingBoxDetection {
	label: string;
	// Normalized bounding box [ymin, xmin, ymax, xmax] in percentages (0 to 100)
	bbox: [number, number, number, number];
	category?: 'tops' | 'bottoms' | 'shoes' | 'outerwear' | 'accessories';
	fit?: string; // 'wide-leg' | 'baggy' | 'relaxed' | 'straight-leg' | 'slim' | 'skinny' | 'oversized' | 'boxy' | 'cropped' | 'regular'
	name?: string;
	description?: string;
	tags?: string[];
	isProductShot?: boolean;
}

export interface GarmentTagResult {
	name: string;
	description: string;
	category: 'tops' | 'bottoms' | 'shoes' | 'outerwear' | 'accessories';
	fit?: string;
	tags: string[];
}

export interface OutfitSuggestionResult {
	suggestions: Record<string, string[]>; // slotName -> array of garment IDs
	reasoning: string;
}

async function executeGeminiRequest(
	model: string,
	apiKey: string,
	body: any,
	timeoutMs = 30000
): Promise<{ ok: boolean; status: number; data?: any; errorText?: string }> {
	try {
		const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(timeoutMs)
		});

		if (!res.ok) {
			const errorText = await res.text();
			return { ok: false, status: res.status, errorText };
		}

		const data = await res.json();
		return { ok: true, status: res.status, data };
	} catch (err: any) {
		return { ok: false, status: 0, errorText: err.message || 'Network error' };
	}
}

async function callGemini(contents: any[], schema?: any): Promise<any> {
	const apiKey = getApiKey();

	const body: any = {
		contents: [{ parts: contents }],
		generationConfig: {
			temperature: 0.2,
			responseMimeType: 'application/json'
		}
	};

	if (schema) {
		body.generationConfig.responseSchema = schema;
	}

	// 1. Primary Attempt: gemini-3.5-flash-lite
	let response = await executeGeminiRequest(PRIMARY_GEMINI_MODEL, apiKey, body);

	// Check if primary model failed due to high demand (503), rate limit (429), server error (5xx), timeout, or overload
	const shouldFallback =
		!response.ok &&
		(response.status === 503 ||
			response.status === 429 ||
			response.status === 0 ||
			response.status >= 500 ||
			(response.errorText &&
				(response.errorText.includes('high demand') ||
					response.errorText.includes('UNAVAILABLE') ||
					response.errorText.includes('RESOURCE_EXHAUSTED') ||
					response.errorText.includes('spikes in demand'))));

	if (shouldFallback) {
		console.warn(
			`[AI Engine] Primary model ${PRIMARY_GEMINI_MODEL} failed (${response.status}: ${response.errorText?.slice(0, 150)}). Falling back to ${FALLBACK_GEMINI_MODEL} on the same key...`
		);

		// 2. Fallback Attempt: gemini-3.1-flash-lite on the same key
		response = await executeGeminiRequest(FALLBACK_GEMINI_MODEL, apiKey, body);

		// If fallback also hits a temporary 503 high demand spike, retry once after a short pause
		if (!response.ok && (response.status === 503 || response.errorText?.includes('high demand'))) {
			console.warn(
				`[AI Engine] Fallback model ${FALLBACK_GEMINI_MODEL} also experiencing high demand. Retrying once after 1.5s...`
			);
			await new Promise((r) => setTimeout(r, 1500));
			response = await executeGeminiRequest(FALLBACK_GEMINI_MODEL, apiKey, body);
		}
	}

	if (!response.ok) {
		throw new Error(`Gemini API error (${response.status}): ${response.errorText}`);
	}

	const data = response.data;
	const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
	if (!text) throw new Error('No response received from Gemini');

	try {
		return JSON.parse(text);
	} catch (e) {
		// Clean markdown fences if present
		const clean = text.replace(/```json\n?|\n?```/g, '').trim();
		return JSON.parse(clean);
	}
}

/**
 * Detects all distinct garments and footwear in an uploaded photo and returns normalized bounding boxes.
 * Coordinates are percentages (0-100): [ymin, xmin, ymax, xmax]
 */
export async function detectGarmentsInPhoto(base64Image: string, mimeType = 'image/jpeg'): Promise<BoundingBoxDetection[]> {
	// 1. Try Local AI if preferred, available, and capabilities include 'detect'
	try {
		if (await isLocalAiPreferred()) {
			const health = await checkLocalAiHealth();
			if (health.available && health.capabilities?.includes('detect')) {
				console.log(`[AI Engine] Routing garment detection to Local AI (${health.gpu})...`);
				const localDetections = await detectGarmentsLocally(base64Image, mimeType);
				if (localDetections && localDetections.length > 0) {
					console.log(`[AI Engine] Local AI successfully detected ${localDetections.length} garments.`);
					return localDetections as BoundingBoxDetection[];
				}
			}
		}
	} catch (localErr: any) {
		console.warn(`[AI Engine] Local AI detection unavailable or failed (${localErr.message}), falling back to Gemini...`);
	}

	// 2. Cloud Fallback: Google Gemini
	console.log('[AI Engine] Routing garment detection to Google Gemini (3.5 Flash-Lite, fallback: 3.1 Flash-Lite)...');
	const prompt = `You are a precision fashion and garment analysis and object detection system.
Analyze the provided image.

FIRST, determine the nature of the image:
1. E-COMMERCE / CATALOG / PRODUCT PAGE SCREENSHOT:
   - Contains clean studio product shots, online store UI (price, buttons, size picker, title), or multi-view product collages.
   - CRITICAL RULES FOR PRODUCT PAGES & COLLAGES:
     * When multiple images/tiles/angles in the collage depict the SAME SINGLE item (e.g., shoe side view, shoe sole/tread, shoe heel, opposite side; or front/back of a jacket/shirt):
       YOU MUST RECOGNIZE THAT THIS IS ONLY ONE PIECE OF CLOTHING OR FOOTWEAR, NOT MULTIPLE!
     * DO NOT create multiple separate items for different angles, soles, or heels of the same item! Return EXACTLY ONE item detection for this product.
     * BOUNDING BOX RULE: GET ALL THE ANGLES! Enclose the entire product photo gallery / collage showing all the angles and views of the item together in ONE single bounding box. Exclude the surrounding website UI (e.g., shopping text, price, add to cart button, size selectors, ratings, shipping info, or browser headers).
     * If product text/brand/title is visible in the screenshot (e.g., "ASICS GEL-Excite 11", "Karl Lagerfeld"), extract the accurate product name, description, category, and tags.
     * Set "isProductShot": true (indicates this is already a studio/catalog photo, so no synthetic display image should be generated).

2. CASUAL REAL-WORLD PHOTO (e.g. clothes laid on a bed, floor, carpet, or table):
   * Detect EVERY distinct physical garment or pair of shoes present.
   * For pairs of shoes placed together, group as one bounding box.
   * Ensure the bounding box covers the entire garment with a 2% margin so no pockets, hems, or laces are cut off.
   * Set "isProductShot": false (indicates it needs studio staging/flat-lay generation).

Rules for bounding boxes:
- "bbox" MUST be a single flat array of 4 numbers: [ymin, xmin, ymax, xmax] as percentages from 0 to 100.
  - ymin: top edge (0 to 100)
  - xmin: left edge (0 to 100)
  - ymax: bottom edge (0 to 100)
  - xmax: right edge (0 to 100)

Return a structured JSON object with:
{
  "isProductShot": boolean,
  "productPageTitle": string or null,
  "items": [
    {
      "name": string (descriptive title or extracted product title),
      "category": "tops" | "bottoms" | "shoes" | "outerwear" | "accessories",
      "fit": "wide-leg" | "baggy" | "relaxed" | "straight-leg" | "slim" | "skinny" | "oversized" | "boxy" | "cropped" | "regular",
      "description": string (1-2 sentences on color, material, pattern, wash, cut/silhouette),
      "tags": string[] (5-10 relevant tags including cut/fit),
      "bbox": [ymin, xmin, ymax, xmax],
      "isProductShot": boolean
    }
  ]
}

Return ONLY valid JSON.`;

	const result = await callGemini([
		{ inlineData: { mimeType, data: base64Image } },
		{ text: prompt }
	]);

	let rawItems: any[] = [];
	let globalIsProductShot = false;

	if (Array.isArray(result)) {
		rawItems = result;
	} else if (result && typeof result === 'object') {
		globalIsProductShot = Boolean(result.isProductShot);
		if (Array.isArray(result.items)) rawItems = result.items;
		else if (Array.isArray(result.garments)) rawItems = result.garments;
		else if (result.bbox || result.box_2d) rawItems = [result];
	}

	const detections: BoundingBoxDetection[] = rawItems.map((item: any) => {
		const isItemProductShot = item.isProductShot !== undefined ? Boolean(item.isProductShot) : globalIsProductShot;
		const label = item.name || item.label || 'Clothing Item';
		const category = ['tops', 'bottoms', 'shoes', 'outerwear', 'accessories'].includes(item.category)
			? item.category
			: undefined;

		return {
			label,
			name: item.name || label,
			category,
			fit: item.fit ? String(item.fit).trim().toLowerCase() : undefined,
			description: item.description || '',
			tags: Array.isArray(item.tags) ? item.tags : [],
			bbox: item.bbox || item.box_2d || [5, 5, 95, 95],
			isProductShot: isItemProductShot
		};
	});

	return detections;
}

/**
 * Analyzes a cropped garment or shoe image to generate descriptive catalog metadata and style tags.
 */
export async function tagGarmentCrop(base64Crop: string, mimeType = 'image/jpeg'): Promise<GarmentTagResult> {
	// 1. Try Local AI if preferred, available, and capabilities include 'tag'
	try {
		if (await isLocalAiPreferred()) {
			const health = await checkLocalAiHealth();
			if (health.available && health.capabilities?.includes('tag')) {
				console.log(`[AI Engine] Routing garment tagging to Local AI (${health.gpu})...`);
				const localTag = await tagGarmentLocally(base64Crop, mimeType);
				if (localTag && localTag.name) {
					console.log(`[AI Engine] Local AI successfully tagged: "${localTag.name}" (${localTag.category})`);
					return localTag;
				}
			}
		}
	} catch (localErr: any) {
		console.warn(`[AI Engine] Local AI tagging unavailable or failed (${localErr.message}), falling back to Gemini...`);
	}

	// 2. Cloud Fallback: Google Gemini
	console.log('[AI Engine] Routing garment tagging to Google Gemini (3.5 Flash-Lite, fallback: 3.1 Flash-Lite)...');
	const prompt = `Analyze this specific garment or footwear item. Pay close attention to its cut, silhouette, width, and proportions (e.g. wide-leg vs straight vs slim for pants; boxy/oversized vs regular/fitted for tops).
Return a structured JSON object with:
- "name": Concise title (e.g. "Vintage Faded Wide-Leg Denim Jeans", "Tommy Hilfiger Black Drawstring Shorts", "Skechers All-Black Mesh Running Shoes")
- "description": One detailed sentence detailing color, material, pattern, wash, cut, and key styling features.
- "category": EXACTLY one of ["tops", "bottoms", "shoes", "outerwear", "accessories"]
- "fit": EXACTLY one of ["wide-leg", "baggy", "relaxed", "straight-leg", "slim", "skinny", "oversized", "boxy", "cropped", "regular"] (For pants/jeans with wide legs from thigh to hem, use "wide-leg" or "baggy". For roomy tops, use "oversized" or "boxy").
- "tags": Array of 5 to 10 relevant tags (e.g. color, fabric like "denim" or "mesh", style like "casual", "streetwear", "athletic", fit like "wide-leg" or "relaxed", season like "summer"). For shoes include brand/model if visible, footwear type like "sneakers", "running".

Return valid JSON.`;

	const result = await callGemini([
		{ inlineData: { mimeType, data: base64Crop } },
		{ text: prompt }
	]);

	let itemData = result;
	if (Array.isArray(itemData)) itemData = itemData[0] || {};
	else if (itemData.items && Array.isArray(itemData.items)) itemData = itemData.items[0] || {};
	else if (itemData.garment) itemData = itemData.garment;

	return {
		name: itemData.name || 'Untitled Garment',
		description: itemData.description || '',
		category: ['tops', 'bottoms', 'shoes', 'outerwear', 'accessories'].includes(itemData.category)
			? itemData.category
			: 'tops',
		fit: itemData.fit ? String(itemData.fit).trim().toLowerCase() : undefined,
		tags: Array.isArray(itemData.tags) ? itemData.tags : []
	};
}

/**
 * Suggests matching wardrobe pieces to complete an incomplete outfit.
 */
export async function suggestOutfitCompletions(
	selectedItems: Array<{ slot: string; name: string; category: string; description: string; tags: string[]; base64Image?: string }>,
	candidatesBySlot: Record<string, Array<{ id: string; name: string; category: string; description: string; tags: string[]; base64Image?: string }>>
): Promise<OutfitSuggestionResult> {
	const parts: any[] = [];

	let prompt = `You are a personal fashion stylist AI.
A user is assembling an outfit and needs suggestions to complete their look.

Current selected items in the outfit:\n`;

	selectedItems.forEach((item, idx) => {
		prompt += `- Slot [${item.slot.toUpperCase()}]: "${item.name}" (${item.category}). Description: ${item.description}. Tags: ${item.tags.join(', ')}\n`;
		if (item.base64Image) {
			parts.push({ text: `Image of selected item [${item.slot}]:` });
			parts.push({ inlineData: { mimeType: 'image/jpeg', data: item.base64Image } });
		}
	});

	prompt += `\nHere are the candidate wardrobe items available for each EMPTY slot:\n`;

	for (const [slot, items] of Object.entries(candidatesBySlot)) {
		prompt += `\nCandidates for empty slot [${slot.toUpperCase()}]:\n`;
		items.forEach((item) => {
			prompt += `  * ID: "${item.id}" | Name: "${item.name}" | Description: ${item.description} | Tags: ${item.tags.join(', ')}\n`;
			if (item.base64Image) {
				parts.push({ text: `Candidate [${slot}] ID ${item.id}:` });
				parts.push({ inlineData: { mimeType: 'image/jpeg', data: item.base64Image } });
			}
		});
	}

	prompt += `\nTask:
1. For each empty slot, select and rank the top 1 to 3 best matching item IDs that aesthetically and stylistically complement the already selected items.
2. Consider color harmony, contrast, fabric texture, style cohesion (e.g. streetwear, casual summer, athletic), and proportion.
3. Provide a clear, concise rationale explaining why these combinations work together.

Return JSON in this format:
{
  "suggestions": {
    "slot_name": ["id1", "id2"]
  },
  "reasoning": "A short 2-3 sentence explanation of the styling advice."
}`;

	parts.push({ text: prompt });

	const result = await callGemini(parts);

	let suggestionData = result;
	if (Array.isArray(suggestionData)) suggestionData = suggestionData[0] || {};

	return {
		suggestions: suggestionData.suggestions || {},
		reasoning: suggestionData.reasoning || 'These items harmonize well in color, texture, and style.'
	};
}

export interface WardrobeGarmentCandidate {
	id: string;
	name: string;
	category: string;
	description?: string | null;
	tags?: string[];
}

export interface OccupiedSlotGarment {
	slot: string;
	garmentId: string;
	name: string;
	category: string;
	description?: string;
	tags?: string[];
}

export interface WardrobeMatchResponse {
	suggestions: Record<string, string[]>;
	reasoning: string;
}

const SLOT_REQUIREMENTS: Record<string, string> = {
	top: 'tops',
	bottom: 'bottoms',
	shoes: 'shoes',
	outerwear: 'outerwear',
	accessory: 'accessories'
};

/**
 * Evaluates the entire wardrobe inventory against current occupied slots
 * using Google Gemini 3.5 Flash-Lite with the regular GEMINI_API_KEY.
 * Suggests the best matching garments for all empty slots.
 */
export async function suggestWardrobeMatchesWithFlashLite(
	occupiedSlots: OccupiedSlotGarment[],
	emptySlots: string[],
	wardrobe: WardrobeGarmentCandidate[]
): Promise<WardrobeMatchResponse> {
	let prompt = `You are an elite personal fashion stylist and wardrobe consultant.
A client is putting together an outfit in their virtual closet and wants you to choose the best matching pieces from their wardrobe to complete the look.

`;

	if (occupiedSlots.length > 0) {
		prompt += `CURRENTLY OCCUPIED SLOTS IN OUTFIT:\n`;
		for (const item of occupiedSlots) {
			const tagsStr = item.tags && item.tags.length ? ` | Tags: ${item.tags.join(', ')}` : '';
			const descStr = item.description ? ` | Description: ${item.description}` : '';
			prompt += `- [${item.slot.toUpperCase()}]: "${item.name}" (Category: ${item.category})${descStr}${tagsStr}\n`;
		}
	} else {
		prompt += `CURRENTLY OCCUPIED SLOTS: None (Blank Canvas). Recommend a complete, harmonious outfit across the empty slots.\n`;
	}

	prompt += `\nEMPTY SLOTS REQUIRING MATCHES:\n`;
	for (const slot of emptySlots) {
		const expectedCategory = SLOT_REQUIREMENTS[slot.toLowerCase()] || slot;
		prompt += `- [${slot.toUpperCase()}] -> Required Category: "${expectedCategory}"\n`;
	}

	prompt += `\nFULL AVAILABLE WARDROBE INVENTORY (Total: ${wardrobe.length} items):\n`;

	// Group wardrobe by category for structured model comprehension
	const categories = ['tops', 'bottoms', 'shoes', 'outerwear', 'accessories'];
	for (const cat of categories) {
		const itemsInCat = wardrobe.filter((w) => (w.category || '').toLowerCase() === cat);
		if (itemsInCat.length > 0) {
			prompt += `\n[CATEGORY: ${cat.toUpperCase()}] (${itemsInCat.length} available):\n`;
			for (const item of itemsInCat) {
				const tagsStr = item.tags && item.tags.length ? ` | Tags: ${item.tags.join(', ')}` : '';
				const descStr = item.description ? ` | ${item.description}` : '';
				prompt += `  * ID: "${item.id}" | Name: "${item.name}"${descStr}${tagsStr}\n`;
			}
		}
	}

	const uncategorized = wardrobe.filter((w) => !categories.includes((w.category || '').toLowerCase()));
	if (uncategorized.length > 0) {
		prompt += `\n[OTHER CATEGORIES]:\n`;
		for (const item of uncategorized) {
			prompt += `  * ID: "${item.id}" | Name: "${item.name}" (${item.category})\n`;
		}
	}

	prompt += `\nSTYLING TASK:
1. For EVERY empty slot listed above, select the best matching item(s) from the available wardrobe inventory that best complement the occupied pieces.
2. Styling Guidelines:
   - Color Synergy: Balance warm/cool tones, neutral anchors, and deliberate accent pops.
   - Proportions & Silhouette: Ensure silhouettes complement each other (e.g. relaxed pants with fitted tops, or streamlined shoes with wide trousers).
   - Aesthetic Cohesion: Maintain style alignment (e.g. streetwear, casual summer, clean minimalist, smart casual, athletic).
   - Category Compliance: Garments recommended for slot 'top' MUST be from 'tops'; 'bottom' MUST be from 'bottoms'; 'shoes' MUST be from 'shoes'; 'outerwear' MUST be from 'outerwear'; 'accessory' MUST be from 'accessories'.
   - Exclusions: DO NOT suggest items that are already equipped in occupied slots.
   - For each empty slot, return an array of 1 to 3 best matching garment IDs from the inventory (first ID is the top recommendation). If an empty slot's category has no available items in the inventory, return an empty array [].
3. Provide a concise, stylish 2 to 4 sentence rationale explaining why these pieces harmonize together to create a cohesive outfit.

RETURN JSON IN THIS EXACT SCHEMA:
{
  "suggestions": {
    "slot_name": ["id1", "id2"]
  },
  "reasoning": "Clear, stylish explanation of why these pieces work together."
}`;

	const result = await callGemini([{ text: prompt }]);

	let data = result;
	if (Array.isArray(data)) data = data[0] || {};

	return {
		suggestions: data.suggestions || {},
		reasoning: data.reasoning || 'These pieces complement each other in tone, texture, and silhouette.'
	};
}
