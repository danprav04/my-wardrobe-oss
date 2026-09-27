import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { garments } from '$lib/server/db/schema';
import { desc, eq, and, sql } from 'drizzle-orm';
import crypto from 'node:crypto';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const category = url.searchParams.get('category');
		const search = url.searchParams.get('search');
		const tag = url.searchParams.get('tag');

		let query = db.select().from(garments).$dynamic();
		const conditions = [];

		if (category && category !== 'all') {
			conditions.push(eq(garments.category, category));
		}

		if (search) {
			const searchPattern = `%${search.toLowerCase()}%`;
			conditions.push(
				sql`(LOWER(${garments.name}) LIKE ${searchPattern} OR LOWER(${garments.description}) LIKE ${searchPattern} OR LOWER(${garments.tags}) LIKE ${searchPattern})`
			);
		}

		if (tag) {
			const tagPattern = `%"${tag.toLowerCase()}"%`;
			conditions.push(sql`LOWER(${garments.tags}) LIKE ${tagPattern}`);
		}

		if (conditions.length > 0) {
			query = query.where(and(...conditions));
		}

		const items = await query.orderBy(desc(garments.createdAt));

		// Parse tags JSON for client
		const formatted = items.map((item) => {
			let tagsArray: string[] = [];
			try {
				tagsArray = JSON.parse(item.tags);
			} catch {
				tagsArray = [];
			}
			return {
				...item,
				tags: tagsArray
			};
		});

		return json(formatted);
	} catch (err: any) {
		console.error('Failed to fetch garments:', err);
		throw error(500, 'Database error fetching garments');
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const contentType = request.headers.get('content-type') || '';
		let itemsToInsert: any[] = [];

		if (contentType.includes('multipart/form-data')) {
			const formData = await request.formData();
			const name = String(formData.get('name') || '').trim();
			const category = String(formData.get('category') || 'tops').trim();
			const description = String(formData.get('description') || '').trim();
			const fit = formData.get('fit') ? String(formData.get('fit')).trim().toLowerCase() : null;
			const tagsRaw = formData.get('tags');
			let tags: string[] = [];
			if (typeof tagsRaw === 'string') {
				try {
					tags = JSON.parse(tagsRaw);
				} catch {
					tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean);
				}
			}
			const imageUrl = String(formData.get('imageUrl') || formData.get('image_url') || '').trim();
			itemsToInsert.push({ name, category, description, fit, tags, imageUrl });
		} else {
			const body = await request.json();
			itemsToInsert = Array.isArray(body) ? body : [body];
		}

		if (!itemsToInsert.length) {
			throw error(400, 'No garments provided for creation');
		}

		const inserted = [];

		for (const item of itemsToInsert) {
			const id = crypto.randomUUID();
			let tagsArray: string[] = [];
			if (Array.isArray(item.tags)) {
				tagsArray = item.tags;
			} else if (typeof item.tags === 'string') {
				try {
					tagsArray = JSON.parse(item.tags);
				} catch {
					tagsArray = item.tags.split(',').map((t: string) => t.trim()).filter(Boolean);
				}
			}

			// Validate relative paths strictly within designated storage folders
			const cleanCropPath =
				typeof item.cropPath === 'string' &&
				!item.cropPath.includes('..') &&
				/^(crops|originals|cutouts|portraits|tryons)\/[a-zA-Z0-9._-]+$/.test(item.cropPath.trim())
					? item.cropPath.trim()
					: '';

			const cleanOriginalPath =
				typeof item.originalPath === 'string' &&
				!item.originalPath.includes('..') &&
				/^(crops|originals|cutouts|portraits|tryons)\/[a-zA-Z0-9._-]+$/.test(item.originalPath.trim())
					? item.originalPath.trim()
					: null;

			const cleanFit = item.fit ? String(item.fit).trim().toLowerCase() : null;

			const [newGarment] = await db
				.insert(garments)
				.values({
					id,
					name: item.name || 'Untitled Garment',
					description: item.description || '',
					category: item.category || 'tops',
					fit: cleanFit,
					tags: JSON.stringify(tagsArray),
					imageUrl: item.stagedImageUrl || item.imageUrl || item.cropUrl || '',
					cropPath: cleanCropPath,
					originalPath: cleanOriginalPath,
					sourcePhotoId: item.sourcePhotoId || null
				})
				.returning();

			inserted.push({
				...newGarment,
				tags: JSON.parse(newGarment.tags)
			});
		}

		return json(inserted, { status: 201 });
	} catch (err: any) {
		console.error('Failed to create garment(s):', err);
		throw error(500, err.message || 'Failed to save garments to catalog');
	}
};
