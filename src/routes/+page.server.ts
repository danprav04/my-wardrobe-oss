import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { garments } from '$lib/server/db/schema';
import { desc } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
	try {
		const items = await db.select().from(garments).orderBy(desc(garments.createdAt));
		return {
			garments: items.map((item) => ({
				...item,
				tags: JSON.parse(item.tags || '[]') as string[]
			}))
		};
	} catch (err: any) {
		console.warn('Database not initialized or empty:', err.message);
		return {
			garments: []
		};
	}
};
