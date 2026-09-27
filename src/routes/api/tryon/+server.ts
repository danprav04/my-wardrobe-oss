import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { outfits, userProfile, garments } from '$lib/server/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { runVirtualTryOn, type TryOnRequest } from '$lib/server/ai/tryon';
import { readLocalFile } from '$lib/server/storage';
import { getCleanGarmentCutout } from '$lib/server/ai/background-removal';
import { validateSafeUrl } from '$lib/server/url-guard';

async function fetchImageBuffer(urlOrPath: string, fallbackUrl?: string): Promise<Buffer> {
	if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
		const safeUrl = await validateSafeUrl(urlOrPath);
		const res = await fetch(safeUrl);
		if (!res.ok) throw new Error(`Failed to fetch image: ${urlOrPath}`);
		const arrayBuf = await res.arrayBuffer();
		return Buffer.from(arrayBuf);
	}

	try {
		// Local relative path
		const clean = urlOrPath.replace(/^\/api\/storage\//, '');
		return await readLocalFile(clean);
	} catch (e) {
		if (fallbackUrl && (fallbackUrl.startsWith('http://') || fallbackUrl.startsWith('https://'))) {
			const safeFallbackUrl = await validateSafeUrl(fallbackUrl);
			const res = await fetch(safeFallbackUrl);
			if (res.ok) {
				const arrayBuf = await res.arrayBuffer();
				return Buffer.from(arrayBuf);
			}
		}
		throw e;
	}
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { outfitId, slots } = body; // slots: { top?: garmentId, bottom?: garmentId, shoes?: garmentId }

		// 1. Get user portrait
		const [profile] = await db.select().from(userProfile).where(eq(userProfile.id, 1));
		if (!profile || !profile.portraitUrl) {
			throw error(400, 'Please upload a full-body portrait photo in Settings before using Virtual Try-On');
		}

		const portraitBuffer = await fetchImageBuffer(profile.portraitUrl);

		// 2. Fetch the selected garments
		const garmentIds = Object.values(slots || {}).filter(Boolean) as string[];
		if (!garmentIds.length) {
			throw error(400, 'At least one garment must be selected to try on');
		}

		const garmentsDb = await db.select().from(garments).where(inArray(garments.id, garmentIds));

		const tryOnPayload: TryOnRequest = {
			portraitBuffer,
			userProfile: {
				height: profile.height,
				bodyType: profile.bodyType,
				fitPreference: profile.fitPreference
			}
		};

		// Top: MUST use the actual cutout crop (cropPath), NOT the prettified retail image (imageUrl)
		if (slots.top) {
			const top = garmentsDb.find((g) => g.id === slots.top);
			if (top) {
				const rawCropPath = top.cropPath || top.imageUrl;
				const rawBuf = await fetchImageBuffer(rawCropPath, top.imageUrl);
				const cleanCutout = await getCleanGarmentCutout(top.id, rawBuf);
				tryOnPayload.topGarment = {
					buffer: cleanCutout,
					name: top.name,
					description: top.description || top.name,
					category: top.category,
					fit: top.fit,
					tags: JSON.parse(top.tags || '[]')
				};
			}
		}

		// Bottom: MUST use the actual cutout crop (cropPath), NOT the prettified retail image (imageUrl)
		if (slots.bottom) {
			const bottom = garmentsDb.find((g) => g.id === slots.bottom);
			if (bottom) {
				const rawCropPath = bottom.cropPath || bottom.imageUrl;
				const rawBuf = await fetchImageBuffer(rawCropPath, bottom.imageUrl);
				const cleanCutout = await getCleanGarmentCutout(bottom.id, rawBuf);
				tryOnPayload.bottomGarment = {
					buffer: cleanCutout,
					name: bottom.name,
					description: bottom.description || bottom.name,
					category: bottom.category,
					fit: bottom.fit,
					tags: JSON.parse(bottom.tags || '[]')
				};
			}
		}

		// Shoes: MUST use the actual cutout crop (cropPath), NOT the prettified retail image (imageUrl)
		if (slots.shoes) {
			const shoes = garmentsDb.find((g) => g.id === slots.shoes);
			if (shoes) {
				const rawCropPath = shoes.cropPath || shoes.imageUrl;
				const rawBuf = await fetchImageBuffer(rawCropPath, shoes.imageUrl);
				const cleanCutout = await getCleanGarmentCutout(shoes.id, rawBuf);
				tryOnPayload.shoes = {
					buffer: cleanCutout,
					name: shoes.name,
					description: shoes.description || shoes.name,
					category: shoes.category,
					tags: JSON.parse(shoes.tags || '[]')
				};
			}
		}

		console.log('Initiating virtual try-on workflow...');
		const tryonUrl = await runVirtualTryOn(tryOnPayload, outfitId || 'preview');

		// If this tryon was for an existing saved outfit, update it
		if (outfitId) {
			await db
				.update(outfits)
				.set({ tryonUrl, updatedAt: new Date() })
				.where(eq(outfits.id, outfitId));
		}

		return json({
			success: true,
			tryonUrl
		});
	} catch (err: any) {
		console.error('Virtual try-on execution error:', err);
		throw error(500, err.message || 'Virtual try-on failed to process');
	}
};
