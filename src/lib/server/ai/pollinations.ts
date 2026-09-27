/**
 * Free AI Retail Flat-Lay Generation via Pollinations.ai (FLUX / SDXL)
 * Generates commercial, ironed, e-commerce catalog flat-lays for clothing pieces
 * with zero API costs, zero quotas, and zero required authentication.
 */

export interface GarmentVisualSpec {
	name: string;
	category: string;
	description?: string;
	tags?: string[];
}

/**
 * Builds a highly constrained e-commerce prompt based on garment category and details.
 * Prevents models, humans, and hangers from appearing.
 */
export function buildFlatLayPrompt(spec: GarmentVisualSpec): string {
	const category = (spec.category || 'tops').toLowerCase();
	const name = spec.name || 'apparel item';
	const desc = spec.description || spec.name;
	const tagsStr = spec.tags && spec.tags.length > 0 ? spec.tags.join(', ') : '';
	const isDenim = category.includes('jean') || name.toLowerCase().includes('jean') || name.toLowerCase().includes('denim');

	if (category === 'shoes' || category.includes('footwear') || category.includes('sneaker')) {
		return [
			`Commercial e-commerce studio product photography of a pair of ${name}.`,
			desc,
			tagsStr ? `Details: ${tagsStr}.` : '',
			'Pair of shoes placed neatly side-by-side at a dynamic three-quarter catalog perspective.',
			'Pure clean solid light gray studio backdrop (#f4f4f5), soft professional softbox studio lighting, crisp commercial footwear catalog style.',
			'Footwear only, shoes only, no human, no person, no feet, no legs, no box.'
		].filter(Boolean).join(' ');
	}

	if (category === 'bottoms' || category.includes('pant') || category.includes('jean') || category.includes('short')) {
		const styleNote = isDenim ? 'luxury denim apparel catalog style.' : 'clean contemporary apparel catalog style.';
		return [
			`Commercial e-commerce studio flat-lay product photography of ${name}.`,
			desc,
			tagsStr ? `Details: ${tagsStr}.` : '',
			'Pants laid completely flat, straight legs, centered, top-down 90-degree overhead flat lay.',
			`Pure clean solid light gray studio background (#f4f4f5), soft even commercial studio lighting, ${styleNote}`,
			'Clothing only, trousers only, no human, no person, no body, no legs, no hanger.'
		].filter(Boolean).join(' ');
	}

	// Default to tops / outerwear / accessories
	return [
		`Commercial e-commerce studio flat-lay product photography of ${name}.`,
		desc,
		tagsStr ? `Details: ${tagsStr}.` : '',
		'Garment laid completely flat and ironed, symmetrical folded sleeves, centered, top-down 90-degree overhead flat lay view.',
		'Pure clean solid light gray studio background (#f4f4f5), soft even commercial studio softbox lighting, high-end retail fashion catalog, Uniqlo style.',
		'Clothing item only, flat apparel only, no person, no human, no body, no model, no mannequin, no hanger.'
	].filter(Boolean).join(' ');
}

/**
 * Calls Pollinations.ai FLUX endpoint to generate an e-commerce flat-lay JPEG buffer.
 * Retries up to 2 times on temporary network error.
 */
export async function generateRetailFlatLay(spec: GarmentVisualSpec, seedOffset = 0): Promise<Buffer> {
	const prompt = buildFlatLayPrompt(spec);
	const seed = Math.floor(Math.random() * 100000) + seedOffset;
	const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=768&height=768&nologo=true&seed=${seed}&model=flux`;

	let lastError: any = null;

	for (let attempt = 1; attempt <= 2; attempt++) {
		try {
			console.log(`[Pollinations] Generating retail flat-lay for "${spec.name}" (attempt ${attempt})...`);
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 45000);

			const res = await fetch(url, { signal: controller.signal });
			clearTimeout(timeout);

			if (!res.ok) {
				throw new Error(`Pollinations API returned HTTP ${res.status}: ${res.statusText}`);
			}

			const arrayBuffer = await res.arrayBuffer();
			const buffer = Buffer.from(arrayBuffer);

			if (buffer.length < 5000) {
				throw new Error(`Generated image buffer too small (${buffer.length} bytes)`);
			}

			console.log(`[Pollinations] Successfully generated flat-lay for "${spec.name}" (${buffer.length} bytes)`);
			return buffer;
		} catch (err: any) {
			console.warn(`[Pollinations] Attempt ${attempt} failed for "${spec.name}":`, err.message);
			lastError = err;
			if (attempt < 2) {
				await new Promise((r) => setTimeout(r, 1500));
			}
		}
	}

	throw lastError || new Error('Failed to generate retail flat-lay');
}
