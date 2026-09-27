export interface FlatLayVisualSpec {
	name: string;
	category: string;
	description?: string;
	tags?: string[];
}

/**
 * Builds the exact e-commerce studio flat-lay prompt matching our proven Flow / Nano Banana guidelines.
 * Specifically handles ironed wrinkle-free styling, upright 90-deg overhead angles, shorts vs pants,
 * front-view enforcement, and side-by-side footwear catalog framing.
 */
export function buildNanoBananaFlatLayPrompt(spec: FlatLayVisualSpec): string {
	const category = (spec.category || 'tops').toLowerCase();
	const name = spec.name || 'clothing piece';
	const desc = spec.description || spec.name;
	const tagsStr = spec.tags && spec.tags.length > 0 ? spec.tags.join(', ') : '';

	const isShoe =
		category.includes('shoe') ||
		category.includes('footwear') ||
		category.includes('sneaker') ||
		name.toLowerCase().includes('shoe') ||
		name.toLowerCase().includes('sneaker');

	if (isShoe) {
		return [
			`A professional commercial e-commerce footwear product photograph of this exact pair of shoes: ${name}.`,
			desc,
			tagsStr ? `Details: ${tagsStr}.` : '',
			'Placed neatly side-by-side at a three-quarter catalog perspective on a seamless solid light-gray studio backdrop (#f4f4f5).',
			'Preserve the exact colors, mesh/leather textures, midsole, logos, and laces from the reference image.',
			'Crisp commercial studio softbox lighting with subtle, realistic contact shadows beneath the shoes.',
			'Footwear only: absolutely no human, no person, no feet, no legs, no box.'
		].filter(Boolean).join(' ');
	}

	const isShorts =
		category.includes('short') ||
		name.toLowerCase().includes('short') ||
		(spec.tags || []).some((t) => t.toLowerCase().includes('short'));

	const isBottom =
		category.includes('bottom') ||
		category.includes('pant') ||
		category.includes('jean') ||
		isShorts;

	let garmentSpecificInstruction =
		'The clothing must be completely ironed, steam-pressed, smooth, and 100% wrinkle-free with neatly spread symmetrical sleeves and straight collar and hem.';

	if (isShorts) {
		garmentSpecificInstruction =
			'The clothing must be completely ironed, steam-pressed, smooth, and 100% wrinkle-free with straight leg openings and symmetrical waistband. CRUCIAL: These are SHORTS, cut above the knee with raw or hemmed openings, NOT long pants. FRONT VIEW ONLY.';
	} else if (isBottom) {
		garmentSpecificInstruction =
			'The garment must be laid completely unfolded and flat, perfectly ironed, steam-pressed, and 100% wrinkle-free with straight legs pointing down and waistband at top. CRUCIAL: Do NOT fold the garment. FRONT VIEW ONLY (front pockets, button, and zipper fly visible, NOT back pockets). Single garment only.';
	}

	return [
		`A professional, commercial e-commerce studio flat-lay photograph of this exact ${name}.`,
		desc,
		tagsStr ? `Details: ${tagsStr}.` : '',
		garmentSpecificInstruction,
		'Positioned centered in an upright vertical 90-degree top-down overhead flat lay on a seamless solid light-gray studio backdrop (#f4f4f5).',
		'Soft, even commercial softbox lighting with subtle, realistic soft drop shadows directly underneath the fabric.',
		'Accurately preserve the exact colors, wash, fabric textures, logos, graphic prints, buttons, drawstrings, and stitching from the reference photo.',
		'Apparel only: absolutely no human, no person, no body, no model, no mannequin, no hanger, no bedsheet, no floor, no wrinkles.'
	].filter(Boolean).join(' ');
}
