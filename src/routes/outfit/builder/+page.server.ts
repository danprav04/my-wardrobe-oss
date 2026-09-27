import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { garments, userProfile, outfits, outfitItems } from '$lib/server/db/schema';
import { desc, eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ url }) => {
	try {
		const allGarments = await db.select().from(garments).orderBy(desc(garments.createdAt));
		const [profile] = await db.select().from(userProfile).where(eq(userProfile.id, 1));
		const editId = url.searchParams.get('edit');

		let editOutfit = null;
		if (editId) {
			const [outfit] = await db.select().from(outfits).where(eq(outfits.id, editId));
			if (outfit) {
				const items = await db
					.select({
						slot: outfitItems.slot,
						layerOrder: outfitItems.layerOrder,
						garmentId: outfitItems.garmentId
					})
					.from(outfitItems)
					.where(eq(outfitItems.outfitId, editId));
				editOutfit = {
					...outfit,
					items
				};
			}
		}

		const { getActiveImageEngine } = await import('$lib/server/ai/puter-client');
		const activeEngine = await getActiveImageEngine();

		return {
			garments: allGarments.map((g) => ({
				...g,
				tags: JSON.parse(g.tags || '[]') as string[]
			})),
			hasPortrait: Boolean(profile?.portraitUrl),
			editOutfit,
			activeEngine
		};
	} catch (e: any) {
		console.warn('Error loading outfit builder data:', e.message);
		return {
			garments: [],
			hasPortrait: false,
			editOutfit: null
		};
	}
};
