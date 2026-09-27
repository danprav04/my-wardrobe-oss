import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { garments } from '$lib/server/db/schema';
import { eq, isNull, or } from 'drizzle-orm';

export interface GarmentFitUpdateItem {
	id: string;
	fit: string;
	name?: string;
	description?: string;
	tags?: string[];
}

/**
 * GET /api/garments/manual/fit
 * Returns all garments with their ID, name, category, and current fit attribute.
 * Pass ?missingOnly=true to filter for garments where fit is null or empty.
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const missingOnly = url.searchParams.get('missingOnly') === 'true' || url.searchParams.get('missing') === 'true';
		const allGarments = await db.select().from(garments);

		const mapped = allGarments.map((g) => ({
			id: g.id,
			name: g.name,
			category: g.category,
			fit: g.fit || null,
			description: g.description,
			tags: (() => {
				try {
					return JSON.parse(g.tags || '[]');
				} catch {
					return [];
				}
			})(),
			imageUrl: g.imageUrl
		}));

		const filtered = missingOnly ? mapped.filter((g) => !g.fit) : mapped;
		const missingCount = mapped.filter((g) => !g.fit).length;

		return json({
			status: 'ok',
			total: mapped.length,
			missingFitCount: missingCount,
			garments: filtered
		});
	} catch (err: any) {
		console.error('[Manual Fit API] Failed to fetch garments:', err);
		throw error(500, err.message || 'Database error fetching garments');
	}
};

/**
 * POST /api/garments/manual/fit
 * Batch or single update endpoint to populate or modify garment fit attributes.
 *
 * Accepted payloads:
 * 1. { "items": [ { "id": "item_38", "fit": "wide-leg", "name": "..." }, ... ] }
 * 2. [ { "id": "item_38", "fit": "wide-leg" }, ... ]
 * 3. { "id": "item_38", "fit": "wide-leg" }
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json().catch(() => null);
		if (!body) {
			throw error(400, 'Invalid JSON body');
		}

		let itemsToUpdate: GarmentFitUpdateItem[] = [];

		if (Array.isArray(body)) {
			itemsToUpdate = body;
		} else if (Array.isArray(body.items)) {
			itemsToUpdate = body.items;
		} else if (body.id && body.fit !== undefined) {
			itemsToUpdate = [body];
		}

		if (!itemsToUpdate.length) {
			throw error(400, 'No garment fit items provided. Expected { items: [{ id, fit }] } or [{ id, fit }].');
		}

		const results: any[] = [];
		const errors: Array<{ id: string; error: string }> = [];

		for (const item of itemsToUpdate) {
			if (!item.id) {
				errors.push({ id: 'unknown', error: 'Missing garment ID' });
				continue;
			}

			const updateData: any = {
				updatedAt: new Date()
			};

			if (item.fit !== undefined) {
				updateData.fit = item.fit ? item.fit.trim().toLowerCase() : null;
			}
			if (item.name !== undefined) {
				updateData.name = item.name.trim();
			}
			if (item.description !== undefined) {
				updateData.description = item.description.trim();
			}
			if (item.tags !== undefined) {
				updateData.tags = JSON.stringify(item.tags);
			}

			try {
				const [updated] = await db
					.update(garments)
					.set(updateData)
					.where(eq(garments.id, item.id))
					.returning();

				if (updated) {
					results.push({
						id: updated.id,
						name: updated.name,
						category: updated.category,
						fit: updated.fit,
						updated: true
					});
				} else {
					errors.push({ id: item.id, error: 'Garment not found' });
				}
			} catch (e: any) {
				errors.push({ id: item.id, error: e.message || 'Update failed' });
			}
		}

		return json({
			success: true,
			updatedCount: results.length,
			items: results,
			errors: errors.length > 0 ? errors : undefined
		});
	} catch (err: any) {
		console.error('[Manual Fit API] Error updating garment fits:', err);
		if (err.status) throw err;
		throw error(500, err.message || 'Internal server error updating garment fits');
	}
};

export const PUT: RequestHandler = POST;
export const PATCH: RequestHandler = POST;
