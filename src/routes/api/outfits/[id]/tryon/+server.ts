import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { outfits } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const DELETE: RequestHandler = async ({ params }) => {
	const { id } = params;
	const [outfit] = await db.select().from(outfits).where(eq(outfits.id, id));

	if (!outfit) {
		throw error(404, 'Outfit not found');
	}

	await db
		.update(outfits)
		.set({ tryonUrl: null, updatedAt: new Date() })
		.where(eq(outfits.id, id));

	return json({ success: true, id, tryonUrl: null });
};
