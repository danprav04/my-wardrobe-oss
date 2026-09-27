import { v2 as cloudinary } from 'cloudinary';
import { env } from '$env/dynamic/private';

function getCloudinary() {
	const url = env.CLOUDINARY_URL || process.env.CLOUDINARY_URL;
	if (url) {
		const match = url.match(/cloudinary:\/\/([^:]+):([^@]+)@(.+)/);
		if (match) {
			cloudinary.config({
				api_key: match[1],
				api_secret: match[2],
				cloud_name: match[3],
				secure: true
			});
		} else {
			cloudinary.config({ cloudinary_url: url, secure: true });
		}
	}
	return cloudinary;
}

/**
 * Uploads a garment crop to Cloudinary and applies AI Generative Background Replacement
 * to render a clean, professional studio e-commerce flat-lay on a white backdrop.
 * Note: Cloudinary prompt MUST NOT contain commas, as commas delimit transformations.
 */
export async function stageProductPhoto(cropBuffer: Buffer, garmentId: string): Promise<string> {
	const cld = getCloudinary();

	return new Promise((resolve, reject) => {
		const uploadStream = cld.uploader.upload_stream(
			{
				folder: 'my-wardrobe/catalog',
				public_id: `garment_${garmentId}`,
				resource_type: 'image',
				transformation: [
					// AI Generative Background Replacement: converts bedding/flooring into a clean studio backdrop
					{ effect: 'gen_background_replace:prompt_clean white studio product photography backdrop minimalist soft lighting' },
					{ quality: 'auto', fetch_format: 'auto' }
				]
			},
			(error, result) => {
				if (error) {
					console.error('Cloudinary AI Staging failed, falling back to clean upload:', error);
					// Fallback: If generative replacement fails or free quota hits, upload standard image
					cld.uploader.upload_stream(
						{
							folder: 'my-wardrobe/catalog',
							public_id: `garment_${garmentId}_raw`,
							resource_type: 'image',
							transformation: [{ quality: 'auto', fetch_format: 'auto' }]
						},
						(fallbackError, fallbackResult) => {
							if (fallbackError) return reject(fallbackError);
							resolve(fallbackResult!.secure_url);
						}
					).end(cropBuffer);
					return;
				}
				resolve(result!.secure_url);
			}
		);

		uploadStream.end(cropBuffer);
	});
}

/**
 * Uploads any image (e.g. try-on composites, portrait uploads) directly to Cloudinary.
 */
export async function uploadImageToCloudinary(imageBuffer: Buffer, folder: string, filename?: string): Promise<string> {
	const cld = getCloudinary();

	return new Promise((resolve, reject) => {
		const options: any = {
			folder: `my-wardrobe/${folder}`,
			resource_type: 'image',
			transformation: [{ quality: 'auto', fetch_format: 'auto' }]
		};
		if (filename) options.public_id = filename;

		const uploadStream = cld.uploader.upload_stream(options, (error, result) => {
			if (error) return reject(error);
			resolve(result!.secure_url);
		});

		uploadStream.end(imageBuffer);
	});
}

/**
 * Removes background from an image using Cloudinary AI Background Removal (first-choice provider).
 * Uploads the image with effect: 'background_removal', format: 'png', and returns the isolated PNG buffer and secure URL.
 */
export async function removeBackgroundWithCloudinary(imageBuffer: Buffer, publicId: string): Promise<{ buffer: Buffer; url: string }> {
	const cld = getCloudinary();

	const url: string = await new Promise((resolve, reject) => {
		const options: any = {
			folder: 'my-wardrobe/cutouts',
			public_id: `cutout_${publicId}`,
			resource_type: 'image',
			format: 'png',
			transformation: [
				{ effect: 'background_removal' }
			]
		};

		const uploadStream = cld.uploader.upload_stream(options, (error, result) => {
			if (error) return reject(error);
			if (!result || !result.secure_url) return reject(new Error('Cloudinary did not return a secure_url'));
			resolve(result.secure_url);
		});

		uploadStream.end(imageBuffer);
	});

	// Download the isolated PNG buffer
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`Failed to download Cloudinary cutout from ${url} (HTTP ${res.status})`);
	}
	const arrayBuffer = await res.arrayBuffer();
	return {
		buffer: Buffer.from(arrayBuffer),
		url
	};
}

