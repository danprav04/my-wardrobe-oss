import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { outfits, outfitItems, garments, userProfile } from '$lib/server/db/schema';
import { desc, eq, inArray } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
	try {
		const allOutfits = await db.select().from(outfits).orderBy(desc(outfits.createdAt));
		const [profile] = await db.select().from(userProfile).where(eq(userProfile.id, 1));
		const hasPortrait = Boolean(profile?.portraitUrl);

		if (!allOutfits.length) {
			return { outfits: [], hasPortrait };
		}

		const outfitIds = allOutfits.map((o) => o.id);
		const items = await db
			.select({
				outfitId: outfitItems.outfitId,
				slot: outfitItems.slot,
				layerOrder: outfitItems.layerOrder,
				garment: garments
			})
			.from(outfitItems)
			.innerJoin(garments, eq(outfitItems.garmentId, garments.id))
			.where(inArray(outfitItems.outfitId, outfitIds));

		const grouped = allOutfits.map((outfit) => {
			const outfitGarments = items
				.filter((i) => i.outfitId === outfit.id)
				.map((i) => ({
					slot: i.slot,
					layerOrder: i.layerOrder,
					...i.garment,
					tags: JSON.parse(i.garment.tags || '[]') as string[]
				}));

			return {
				...outfit,
				items: outfitGarments
			};
		});

		return { outfits: grouped, hasPortrait };
	} catch (e: any) {
		console.warn('Error loading outfits:', e.message);
		return { outfits: [], hasPortrait: false };
	}
};
