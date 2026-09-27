import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { outfits, outfitItems, garments } from '$lib/server/db/schema';
import { desc, eq, inArray } from 'drizzle-orm';
import crypto from 'node:crypto';

export const GET: RequestHandler = async () => {
	try {
		const allOutfits = await db.select().from(outfits).orderBy(desc(outfits.createdAt));

		if (!allOutfits.length) {
			return json([]);
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
					tags: JSON.parse(i.garment.tags || '[]')
				}));

			return {
				...outfit,
				items: outfitGarments
			};
		});

		return json(grouped);
	} catch (err: any) {
		console.error('Failed to fetch outfits:', err);
		throw error(500, 'Database error fetching outfits');
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { name, items, tryonUrl } = body;

		if (!name || typeof name !== 'string') {
			throw error(400, 'Outfit name is required');
		}

		if (!items || !Array.isArray(items) || items.length === 0) {
			throw error(400, 'Outfit must contain at least one item');
		}

		const outfitId = crypto.randomUUID();

		const [newOutfit] = await db
			.insert(outfits)
			.values({
				id: outfitId,
				name,
				tryonUrl: tryonUrl || null
			})
			.returning();

		for (const item of items) {
			await db.insert(outfitItems).values({
				outfitId,
				garmentId: item.garmentId,
				slot: item.slot,
				layerOrder: item.layerOrder || 0
			});
		}

		return json(newOutfit, { status: 201 });
	} catch (err: any) {
		console.error('Failed to create outfit:', err);
		throw error(500, err.message || 'Failed to save outfit');
	}
};
