import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { userProfile, garments, outfits } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { getLocalAiUrl, isLocalAiPreferred } from '$lib/server/ai/local-ai-client';

export const load: PageServerLoad = async () => {
	try {
		const [profile] = await db.select().from(userProfile).where(eq(userProfile.id, 1));
		const [garmentCount] = await db.select({ count: sql<number>`count(*)` }).from(garments);
		const [outfitCount] = await db.select({ count: sql<number>`count(*)` }).from(outfits);

		const localAiUrl = await getLocalAiUrl();
		const preferLocalAi = await isLocalAiPreferred();

		const { getActiveImageEngine, getPuterToken } = await import('$lib/server/ai/puter-client');
		const { hasGeminiImageKey } = await import('$lib/server/ai/gemini-image');
		const activeEngine = await getActiveImageEngine();
		const puterToken = await getPuterToken();
		const geminiImageActive = await hasGeminiImageKey();

		return {
			portraitUrl: profile?.portraitUrl || null,
			height: profile?.height || '',
			bodyType: profile?.bodyType || '',
			fitPreference: profile?.fitPreference || '',
			garmentCount: Number(garmentCount?.count || 0),
			outfitCount: Number(outfitCount?.count || 0),
			hasGeminiKey: Boolean(env.GEMINI_API_KEY || process.env.GEMINI_API_KEY),
			hasGeminiImageKey: geminiImageActive,
			hasHfToken: Boolean(env.HF_TOKEN || process.env.HF_TOKEN),
			hasCloudinaryUrl: Boolean(env.CLOUDINARY_URL || process.env.CLOUDINARY_URL),
			tryonBackend: env.TRYON_BACKEND || 'puter',
			localAiUrl,
			preferLocalAi,
			localAiHealth: null,
			activeEngine,
			hasPuterToken: Boolean(puterToken),
			puterStatus: null
		};
	} catch (e: any) {
		console.warn('Error loading settings:', e.message);
		return {
			portraitUrl: null,
			garmentCount: 0,
			outfitCount: 0,
			hasGeminiKey: false,
			hasGeminiImageKey: false,
			hasHfToken: false,
			hasCloudinaryUrl: false,
			tryonBackend: 'local'
		};
	}
};
