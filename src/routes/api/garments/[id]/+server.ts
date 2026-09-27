import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { garments } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { deleteLocalFile } from '$lib/server/storage';

export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;
	const [item] = await db.select().from(garments).where(eq(garments.id, id));

	if (!item) {
		throw error(404, 'Garment not found');
	}

	return json({
		...item,
		tags: JSON.parse(item.tags || '[]')
	});
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const { id } = params;
	const body = await request.json();

	const updateData: any = {
		updatedAt: new Date()
	};

	if (body.name !== undefined) updateData.name = body.name;
	if (body.description !== undefined) updateData.description = body.description;
	if (body.category !== undefined) updateData.category = body.category;
	if (body.fit !== undefined) updateData.fit = body.fit ? String(body.fit).trim().toLowerCase() : null;
	if (body.tags !== undefined) updateData.tags = JSON.stringify(body.tags);
	if (body.imageUrl !== undefined) updateData.imageUrl = body.imageUrl;

	const [updated] = await db
		.update(garments)
		.set(updateData)
		.where(eq(garments.id, id))
		.returning();

	if (!updated) {
		throw error(404, 'Garment not found');
	}

	return json({
		...updated,
		tags: JSON.parse(updated.tags || '[]')
	});
};

export const DELETE: RequestHandler = async ({ params }) => {
	const { id } = params;
	const [item] = await db.select().from(garments).where(eq(garments.id, id));

	if (!item) {
		throw error(404, 'Garment not found');
	}

	// Delete from database
	await db.delete(garments).where(eq(garments.id, id));

	// Clean up local crop file
	if (item.cropPath) {
		await deleteLocalFile(item.cropPath);
	}

	return json({ success: true, deletedId: id });
};
