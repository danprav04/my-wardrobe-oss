import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { userProfile } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { saveLocalFile } from '$lib/server/storage';
import { uploadImageToCloudinary } from '$lib/server/ai/cloudinary';

export const GET: RequestHandler = async () => {
	const [profile] = await db.select().from(userProfile).where(eq(userProfile.id, 1));
	return json({
		portraitUrl: profile?.portraitUrl || null,
		height: profile?.height || null,
		bodyType: profile?.bodyType || null,
		fitPreference: profile?.fitPreference || null
	});
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const contentType = request.headers.get('content-type') || '';
		let portraitUrl: string | undefined = undefined;
		let height: string | undefined = undefined;
		let bodyType: string | undefined = undefined;
		let fitPreference: string | undefined = undefined;

		if (contentType.includes('multipart/form-data')) {
			const formData = await request.formData();
			const file = formData.get('portrait');

			if (formData.has('height')) height = String(formData.get('height') || '').trim();
			if (formData.has('bodyType') || formData.has('body_type')) {
				bodyType = String(formData.get('bodyType') || formData.get('body_type') || '').trim();
			}
			if (formData.has('fitPreference') || formData.has('fit_preference')) {
				fitPreference = String(formData.get('fitPreference') || formData.get('fit_preference') || '').trim();
			}

			if (file && file instanceof File && file.size > 0) {
				const arrayBuffer = await file.arrayBuffer();
				const buffer = Buffer.from(arrayBuffer);

				// Save local copy
				const filename = `portrait_${Date.now()}.jpg`;
				const localPath = await saveLocalFile('portraits', filename, buffer);
				portraitUrl = `/api/storage/${localPath}`;

				// Upload to Cloudinary if available
				try {
					const cldUrl = await uploadImageToCloudinary(buffer, 'portraits', 'user_portrait');
					portraitUrl = cldUrl;
				} catch (e) {
					console.warn('Cloudinary portrait upload failed, using local URL:', e);
				}
			}
		} else {
			const body = await request.json().catch(() => ({}));
			if (body.portraitUrl !== undefined) portraitUrl = body.portraitUrl;
			if (body.height !== undefined) height = body.height?.trim();
			if (body.bodyType !== undefined) bodyType = body.bodyType?.trim();
			if (body.fitPreference !== undefined) fitPreference = body.fitPreference?.trim();
		}

		// Save to database (upsert profile row id 1)
		const [existing] = await db.select().from(userProfile).where(eq(userProfile.id, 1));
		const updateFields: any = {
			updatedAt: new Date()
		};
		if (portraitUrl !== undefined) updateFields.portraitUrl = portraitUrl;
		if (height !== undefined) updateFields.height = height;
		if (bodyType !== undefined) updateFields.bodyType = bodyType;
		if (fitPreference !== undefined) updateFields.fitPreference = fitPreference;

		if (existing) {
			await db
				.update(userProfile)
				.set(updateFields)
				.where(eq(userProfile.id, 1));
		} else {
			await db.insert(userProfile).values({
				id: 1,
				portraitUrl: portraitUrl || null,
				height: height || null,
				bodyType: bodyType || null,
				fitPreference: fitPreference || null
			});
		}

		const [updated] = await db.select().from(userProfile).where(eq(userProfile.id, 1));
		return json({
			success: true,
			portraitUrl: updated?.portraitUrl,
			height: updated?.height,
			bodyType: updated?.bodyType,
			fitPreference: updated?.fitPreference
		});
	} catch (err: any) {
		console.error('Profile update error:', err);
		throw error(500, err.message || 'Failed to update profile');
	}
};
