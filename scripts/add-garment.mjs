#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function printHelp() {
	console.log(`
My Wardrobe — Programmatic Item Adder CLI

Usage:
  node scripts/add-garment.mjs [options]

Options:
  --name <string>        Garment name (Required)
  --category <string>    tops | bottoms | shoes | outerwear | accessories (Required)
  --desc <string>        Detailed description (Optional)
  --tags <string>        Comma-separated style tags (Optional)
  --file <path>          Path to local image file to upload (Optional)
  --url <string>         Remote image URL to download & ingest (Optional)
  --generate             Generate studio catalog flat-lay via Local AI (Default if no image)
  --stage                Apply Cloudinary AI background replacement on custom image
  --token <jwt>          Session or API token for authenticated requests (Optional)
  --host <url>           Target API base URL (Default: http://localhost:3000)
  --help                 Show this help message

Examples:
  # Add shoes with a local photo
  node scripts/add-garment.mjs --name "Nike Air Force 1" --category shoes --file "path/to/shoe.jpg" --tags "sneakers, white, leather"

  # Add a top and generate a pristine flat-lay with Local AI (RTX 5070 Ti)
  node scripts/add-garment.mjs --name "Charcoal Merino Wool Sweater" --category tops --desc "Fine-gauge crewneck sweater in charcoal gray" --generate

  # Add pants with a remote catalog image
  node scripts/add-garment.mjs --name "Khaki Cargo Chinos" --category bottoms --url "https://example.com/chinos.jpg"
`);
}

async function main() {
	const args = process.argv.slice(2);
	if (args.includes('--help') || args.includes('-h') || args.length === 0) {
		printHelp();
		process.exit(0);
	}

	const getArg = (flag) => {
		const idx = args.indexOf(flag);
		if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
		return null;
	};

	const name = getArg('--name');
	const category = getArg('--category');
	const desc = getArg('--desc') || getArg('--description') || '';
	const tags = getArg('--tags') || '';
	const filePath = getArg('--file') || getArg('--image');
	const imageUrl = getArg('--url');
	const generateStudioImage = args.includes('--generate');
	const stageWithAi = args.includes('--stage');
	const token = getArg('--token') || process.env.WARDROBE_TOKEN || process.env.AUTH_TOKEN || '';
	const host = (getArg('--host') || 'http://localhost:3000').replace(/\/+$/, '');

	if (!name) {
		console.error('Error: --name is required.');
		process.exit(1);
	}
	if (!category) {
		console.error('Error: --category is required (tops, bottoms, shoes, outerwear, accessories).');
		process.exit(1);
	}

	const endpoint = `${host}/api/garments/manual`;
	console.log(`Connecting to ${endpoint}...`);
	console.log(`Adding: "${name}" (${category})`);

	const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

	try {
		let res;
		if (filePath) {
			const resolvedPath = path.resolve(filePath);
			if (!fs.existsSync(resolvedPath)) {
				console.error(`Error: File not found at ${resolvedPath}`);
				process.exit(1);
			}

			const fileBuffer = fs.readFileSync(resolvedPath);
			const ext = path.extname(resolvedPath).toLowerCase();
			const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';

			const formData = new FormData();
			formData.append('name', name);
			formData.append('category', category);
			if (desc) formData.append('description', desc);
			if (tags) formData.append('tags', tags);
			if (generateStudioImage) formData.append('generateStudioImage', 'true');
			if (stageWithAi) formData.append('stageWithAi', 'true');

			const blob = new Blob([fileBuffer], { type: mimeType });
			formData.append('image', blob, path.basename(resolvedPath));

			console.log(`Uploading ${path.basename(resolvedPath)} (${(fileBuffer.length / 1024).toFixed(1)} KB)...`);
			res = await fetch(endpoint, {
				method: 'POST',
				headers: { ...authHeaders },
				body: formData
			});
		} else {
			const payload = {
				name,
				category,
				description: desc,
				tags,
				imageUrl: imageUrl || undefined,
				generateStudioImage: generateStudioImage || !imageUrl,
				stageWithAi
			};

			console.log('Sending JSON payload...', payload);
			res = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', ...authHeaders },
				body: JSON.stringify(payload)
			});
		}

		if (!res.ok) {
			const errText = await res.text();
			console.error(`Server returned HTTP ${res.status}: ${errText}`);
			process.exit(1);
		}

		const data = await res.json();
		console.log('\nSUCCESS! Garment added to catalog:');
		console.log(`  ID:       ${data.garment.id}`);
		console.log(`  Name:     ${data.garment.name}`);
		console.log(`  Category: ${data.garment.category}`);
		console.log(`  Tags:     ${JSON.stringify(data.garment.tags)}`);
		console.log(`  Image:    ${data.garment.imageUrl}`);
		console.log(`  Crop:     ${data.garment.cropPath}`);
	} catch (err) {
		console.error('Failed to add garment:', err.message);
		process.exit(1);
	}
}

main();
