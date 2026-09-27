import fs from 'node:fs';
import path from 'node:path';

async function testFallback() {
	const apiKey = (process.env.GEMINI_API_KEY || '').trim();
	console.log('Testing Gemini API key:', apiKey.substring(0, 8) + '...' + apiKey.slice(-6));

	const cropPath = process.argv[2] || path.join('data', 'crops', 'sample.jpg');
	if (!fs.existsSync(cropPath)) {
		console.error(`Usage: node scripts/test_gemini_fallback.mjs <path-to-image>`);
		console.error(`Specified crop file not found at: ${cropPath}`);
		process.exit(1);
	}

	const cropBuffer = fs.readFileSync(cropPath);
	console.log('Read crop image:', cropBuffer.length, 'bytes');

	const model = 'gemini-3.1-flash-image-preview';
	const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

	const promptText =
		'Commercial e-commerce studio product photography of this exact garment. Transform the provided reference garment crop into an ironed, pristine catalog piece: centered top-down 90-degree overhead flat-lay view, symmetrical folded sleeves. Solid clean light gray studio background (#f4f4f5), soft professional softbox studio lighting, subtle realistic contact drop shadow underneath. Strictly preserve the exact fabric color, material textures, buttons, pockets, seam construction, and branding from the reference image. Clothing item only, no human, no person, no body, no mannequin, no hanger.';

	const body = {
		contents: [
			{
				parts: [
					{ text: promptText },
					{
						inlineData: {
							mimeType: 'image/jpeg',
							data: cropBuffer.toString('base64')
						}
					}
				]
			}
		],
		generationConfig: {
			responseModalities: ['TEXT', 'IMAGE']
		}
	};

	console.log('Sending request to Google AI Studio endpoint:', url.replace(apiKey, 'HIDDEN_KEY'));
	const startTime = Date.now();
	const res = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});

	console.log('HTTP Status:', res.status, res.statusText);
	const text = await res.text();

	if (!res.ok) {
		console.error('Error response body:', text);
		process.exit(1);
	}

	const json = JSON.parse(text);
	const parts = json.candidates?.[0]?.content?.parts || [];
	const imgPart = parts.find((p) => p.inlineData?.data);

	if (!imgPart) {
		console.error('No image returned in response! Parts:', JSON.stringify(parts, null, 2));
		process.exit(1);
	}

	const outBuf = Buffer.from(imgPart.inlineData.data, 'base64');
	const outPath = path.join('data', 'test_gemini_fallback.jpg');
	fs.writeFileSync(outPath, outBuf);
	console.log(`SUCCESS! Generated image in ${Date.now() - startTime}ms, saved to ${outPath} (${outBuf.length} bytes)`);
}

testFallback().catch((err) => {
	console.error('Test exception:', err);
	process.exit(1);
});
