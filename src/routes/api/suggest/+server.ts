import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { garments } from '$lib/server/db/schema';
import { 
	suggestWardrobeMatchesWithFlashLite, 
	type OccupiedSlotGarment, 
	type WardrobeGarmentCandidate 
} from '$lib/server/ai/gemini';

const ALL_SLOTS = ['top', 'bottom', 'shoes', 'outerwear', 'accessory'];

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { selectedSlots = {} } = body;

		if (typeof selectedSlots !== 'object') {
			throw error(400, 'selectedSlots must be an object');
		}

		// 1. Fetch all wardrobe garments from DB
		const allGarmentsDb = await db.select().from(garments);

		if (!allGarmentsDb.length) {
			return json({
				suggestions: {},
				reasoning: 'Your wardrobe is empty. Please add garments before requesting outfit suggestions.'
			});
		}

		// 2. Identify occupied slots and equipped garment IDs
		const occupiedSlots: OccupiedSlotGarment[] = [];
		const occupiedGarmentIds = new Set<string>();

		for (const slot of ALL_SLOTS) {
			const id = selectedSlots[slot];
			if (!id) continue;
			const g = allGarmentsDb.find((item) => item.id === id);
			if (g) {
				occupiedGarmentIds.add(g.id);
				occupiedSlots.push({
					slot,
					garmentId: g.id,
					name: g.name,
					category: g.category,
					description: g.description || '',
					tags: JSON.parse(g.tags || '[]')
				});
			}
		}

		// 3. Determine empty slots
		const emptySlots = ALL_SLOTS.filter((slot) => !selectedSlots[slot]);

		if (!emptySlots.length) {
			return json({
				suggestions: {},
				reasoning: 'Your outfit is already complete! All slots are filled. Clear one or more slots to explore new styling recommendations.'
			});
		}

		// 4. Construct complete available wardrobe inventory (excluding already equipped pieces)
		const wardrobeInventory: WardrobeGarmentCandidate[] = allGarmentsDb
			.filter((g) => !occupiedGarmentIds.has(g.id))
			.map((g) => ({
				id: g.id,
				name: g.name,
				category: g.category,
				description: g.description || '',
				tags: JSON.parse(g.tags || '[]')
			}));

		// 5. Call Gemini 3.5 Flash-Lite using the regular GEMINI_API_KEY (with automatic fallback to 3.1 Flash-Lite)
		console.log(
			`[AI Stylist] Calling Gemini Flash-Lite for outfit matching (Occupied: ${occupiedSlots.length}, Empty: ${emptySlots.length}, Wardrobe items: ${wardrobeInventory.length})...`
		);
		const result = await suggestWardrobeMatchesWithFlashLite(occupiedSlots, emptySlots, wardrobeInventory);

		// 6. Normalize and validate suggestions
		const validGarmentIdSet = new Set(wardrobeInventory.map((w) => w.id));
		const normalizedSuggestions: Record<string, string[]> = {};

		for (const slot of emptySlots) {
			const rawList =
				result.suggestions[slot] ||
				result.suggestions[slot.toLowerCase()] ||
				result.suggestions[slot.toUpperCase()];
			if (Array.isArray(rawList)) {
				// Only keep IDs that exist in the wardrobe inventory
				const validIds = rawList.filter((id) => typeof id === 'string' && validGarmentIdSet.has(id));
				if (validIds.length > 0) {
					normalizedSuggestions[slot] = validIds;
				}
			}
		}

		return json({
			suggestions: normalizedSuggestions,
			reasoning: result.reasoning
		});
	} catch (err: any) {
		console.error('Stylist suggestion error:', err);
		throw error(500, err.message || 'Failed to generate outfit suggestions');
	}
};
