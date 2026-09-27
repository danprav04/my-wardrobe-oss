import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { appSettings } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export interface LocalAiHealthResult {
	available: boolean;
	service?: string;
	gpu?: string;
	vramTotalMb?: number;
	vramFreeMb?: number;
	latencyMs: number;
	url: string;
	modelsFound?: Record<string, string[]>;
	capabilities?: string[];
	error?: string;
}

export interface LocalAiDetection {
	label: string;
	category: string;
	bbox: [number, number, number, number];
}

export interface LocalAiTagResult {
	name: string;
	category: 'tops' | 'bottoms' | 'shoes' | 'outerwear' | 'accessories';
	description: string;
	tags: string[];
}

import fs from 'node:fs';

/**
 * Gets the configured Local AI URL, checking database settings first,
 * falling back to LOCAL_AI_URL env var, then default hostname.
 */
export async function getLocalAiUrl(): Promise<string> {
	const isInsideDocker = fs.existsSync('/.dockerenv');
	const defaultFallback = isInsideDocker ? 'http://local-ai:8000' : 'http://localhost:8000';

	try {
		const [setting] = await db
			.select()
			.from(appSettings)
			.where(eq(appSettings.key, 'local_ai_url'));
		if (setting && setting.value.trim()) {
			let val = setting.value.trim().replace(/\/+$/, '');
			// If running on host outside Docker, internal Docker network name 'local-ai' cannot resolve
			if (!isInsideDocker && val.includes('local-ai:8000')) {
				val = val.replace('local-ai:8000', 'localhost:8000');
			}
			return val;
		}
	} catch (e) {
		// Ignore DB error and fallback to env
	}

	return (env.LOCAL_AI_URL || defaultFallback).replace(/\/+$/, '');
}

/**
 * Sets the configured Local AI URL in app settings.
 */
export async function setLocalAiUrl(url: string): Promise<void> {
	const cleanUrl = url.trim().replace(/\/+$/, '');
	await db
		.insert(appSettings)
		.values({ key: 'local_ai_url', value: cleanUrl })
		.onConflictDoUpdate({
			target: appSettings.key,
			set: { value: cleanUrl }
		});
}

/**
 * Checks whether user prefers Local AI over Cloud AI. Defaults to true.
 */
export async function isLocalAiPreferred(): Promise<boolean> {
	try {
		const [setting] = await db
			.select()
			.from(appSettings)
			.where(eq(appSettings.key, 'prefer_local_ai'));
		if (setting) {
			return setting.value === 'true';
		}
	} catch {
		// Fallback to true
	}
	return true;
}

/**
 * Pings the Local AI service with a tight timeout to verify availability and retrieve GPU stats.
 */
export async function checkLocalAiHealth(targetUrl?: string): Promise<LocalAiHealthResult> {
	const url = targetUrl || (await getLocalAiUrl());
	const startTime = Date.now();

	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 1200);

		const res = await fetch(`${url}/health`, {
			signal: controller.signal
		});
		clearTimeout(timeout);
		const latencyMs = Date.now() - startTime;

		if (!res.ok) {
			return {
				available: false,
				latencyMs,
				url,
				error: `Local AI returned HTTP ${res.status}: ${res.statusText}`
			};
		}

		const data = await res.json();
		return {
			available: true,
			service: data.service,
			gpu: data.gpu_name,
			vramTotalMb: data.vram_total_mb,
			vramFreeMb: data.vram_free_mb,
			latencyMs,
			url,
			modelsFound: data.models_found,
			capabilities: data.capabilities
		};
	} catch (err: any) {
		const latencyMs = Date.now() - startTime;
		return {
			available: false,
			latencyMs,
			url,
			error: err.name === 'AbortError' ? 'Connection timed out' : err.message
		};
	}
}

/**
 * Runs garment bounding box detection through Local AI.
 */
export async function detectGarmentsLocally(
	base64Image: string,
	mimeType = 'image/jpeg'
): Promise<LocalAiDetection[]> {
	const url = await getLocalAiUrl();
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 10000);

	const res = await fetch(`${url}/api/v1/detect`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ image_base64: base64Image, mime_type: mimeType }),
		signal: controller.signal
	});
	clearTimeout(timeout);

	if (!res.ok) {
		throw new Error(`Local AI detection returned HTTP ${res.status}`);
	}

	const data = await res.json();
	return data.detections || [];
}

/**
 * Runs garment tagging through Local AI.
 */
export async function tagGarmentLocally(
	base64Image: string,
	mimeType = 'image/jpeg'
): Promise<LocalAiTagResult> {
	const url = await getLocalAiUrl();
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 10000);

	const res = await fetch(`${url}/api/v1/tag`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ image_base64: base64Image, mime_type: mimeType }),
		signal: controller.signal
	});
	clearTimeout(timeout);

	if (!res.ok) {
		throw new Error(`Local AI tagging returned HTTP ${res.status}`);
	}

	return await res.json();
}

/**
 * Runs outfit suggestions through Local AI.
 */
export async function suggestOutfitLocally(
	equipped: Record<string, any>,
	wardrobe: any[]
): Promise<any[]> {
	const url = await getLocalAiUrl();
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 6000);

	const res = await fetch(`${url}/api/v1/suggest`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ equipped, wardrobe }),
		signal: controller.signal
	});
	clearTimeout(timeout);

	if (!res.ok) {
		throw new Error(`Local AI suggest returned HTTP ${res.status}`);
	}

	const data = await res.json();
	return data.suggestions || [];
}

/**
 * Generates an e-commerce flat-lay image buffer using Local AI.
 */
export async function generateFlatLayLocally(spec: {
	name: string;
	category: string;
	description?: string;
	tags?: string[];
	imageBase64?: string;
}): Promise<Buffer> {
	const url = await getLocalAiUrl();
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 120000);

	const res = await fetch(`${url}/api/v1/generate-flatlay`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			name: spec.name,
			category: spec.category,
			description: spec.description,
			tags: spec.tags,
			image_base64: spec.imageBase64
		}),
		signal: controller.signal
	});
	clearTimeout(timeout);

	if (!res.ok) {
		throw new Error(`Local AI flatlay returned HTTP ${res.status}`);
	}

	const data = await res.json();
	if (data.image_base64) {
		return Buffer.from(data.image_base64, 'base64');
	}
	throw new Error('Local AI flatlay did not return image data');
}

export interface LocalTryOnRequest {
	portraitBuffer: Buffer;
	userProfile?: {
		height?: string | null;
		bodyType?: string | null;
		fitPreference?: string | null;
	};
	topGarment?: { buffer: Buffer; description: string; name?: string; fit?: string | null };
	bottomGarment?: { buffer: Buffer; description: string; name?: string; fit?: string | null };
	shoes?: { buffer: Buffer; description: string; name?: string };
	seed?: number;
}

/**
 * Strips background from an image buffer using Local AI (Rembg GPU/CPU).
 */
export async function removeBackgroundLocally(imageBuffer: Buffer): Promise<Buffer> {
	const url = await getLocalAiUrl();
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 15000);

	const res = await fetch(`${url}/api/v1/remove-background`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			image_base64: imageBuffer.toString('base64')
		}),
		signal: controller.signal
	});
	clearTimeout(timeout);

	if (!res.ok) {
		throw new Error(`Local AI background removal returned HTTP ${res.status}`);
	}

	const data = await res.json();
	if (data.image_base64) {
		return Buffer.from(data.image_base64, 'base64');
	}
	throw new Error('Local AI background removal did not return image data');
}

/**
 * Runs Virtual Try-On using Local AI (Qwen-Image-2.1 DiT on host ComfyUI).
 * Multi-image conditioning preserves user identity and renders clean fitted apparel.
 */
export async function generateTryOnLocally(req: LocalTryOnRequest): Promise<Buffer> {
	const url = await getLocalAiUrl();
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 180000);

	const payload: any = {
		portrait_base64: req.portraitBuffer.toString('base64'),
		seed: req.seed || 42,
		user_profile: req.userProfile
	};

	if (req.topGarment) {
		payload.top = {
			category: 'tops',
			name: req.topGarment.name,
			fit: req.topGarment.fit,
			description: req.topGarment.description,
			image_base64: req.topGarment.buffer.toString('base64')
		};
	}

	if (req.bottomGarment) {
		payload.bottom = {
			category: 'bottoms',
			name: req.bottomGarment.name,
			fit: req.bottomGarment.fit,
			description: req.bottomGarment.description,
			image_base64: req.bottomGarment.buffer.toString('base64')
		};
	}

	if (req.shoes) {
		payload.shoes = {
			category: 'shoes',
			name: req.shoes.name,
			description: req.shoes.description,
			image_base64: req.shoes.buffer.toString('base64')
		};
	}

	console.log(`[Local AI] Submitting virtual try-on request to ${url}/api/v1/tryon...`);
	const res = await fetch(`${url}/api/v1/tryon`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload),
		signal: controller.signal
	});
	clearTimeout(timeout);

	if (!res.ok) {
		const err = await res.text();
		throw new Error(`Local AI tryon returned HTTP ${res.status}: ${err}`);
	}

	const data = await res.json();
	if (data.image_base64) {
		return Buffer.from(data.image_base64, 'base64');
	}
	throw new Error('Local AI tryon did not return image data');
}

