import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { outfits, outfitItems, garments } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;
	const [outfit] = await db.select().from(outfits).where(eq(outfits.id, id));

	if (!outfit) {
		throw error(404, 'Outfit not found');
	}

	const items = await db
		.select({
			slot: outfitItems.slot,
			layerOrder: outfitItems.layerOrder,
			garment: garments
		})
		.from(outfitItems)
		.innerJoin(garments, eq(outfitItems.garmentId, garments.id))
		.where(eq(outfitItems.outfitId, id));

	return json({
		...outfit,
		items: items.map((i) => ({
			slot: i.slot,
			layerOrder: i.layerOrder,
			...i.garment,
			tags: JSON.parse(i.garment.tags || '[]')
		}))
	});
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const { id } = params;
	const body = await request.json();
	const { name, items, tryonUrl } = body;

	const [existing] = await db.select().from(outfits).where(eq(outfits.id, id));
	if (!existing) {
		throw error(404, 'Outfit not found');
	}

	const updateData: any = {
		updatedAt: new Date()
	};
	if (name !== undefined) updateData.name = name;
	if (tryonUrl !== undefined) updateData.tryonUrl = tryonUrl;

	const [updated] = await db
		.update(outfits)
		.set(updateData)
		.where(eq(outfits.id, id))
		.returning();

	if (Array.isArray(items)) {
		await db.delete(outfitItems).where(eq(outfitItems.outfitId, id));
		for (const item of items) {
			await db.insert(outfitItems).values({
				outfitId: id,
				garmentId: item.garmentId,
				slot: item.slot,
				layerOrder: item.layerOrder || 0
			});
		}
	}

	return json(updated);
};

export const DELETE: RequestHandler = async ({ params }) => {
	const { id } = params;
	const [outfit] = await db.select().from(outfits).where(eq(outfits.id, id));

	if (!outfit) {
		throw error(404, 'Outfit not found');
	}

	await db.delete(outfits).where(eq(outfits.id, id));
	return json({ success: true, deletedId: id });
};
