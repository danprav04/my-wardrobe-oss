import { env } from '$env/dynamic/private';

function getHfToken(): string {
	const token = env.HF_TOKEN || process.env.HF_TOKEN;
	if (!token) throw new Error('HF_TOKEN is not configured');
	return token;
}

/**
 * Uploads a file buffer directly to a Hugging Face Space's upload endpoint.
 * Returns the remote server filepath on the Space.
 */
export async function uploadToGradioSpace(spaceUrl: string, fileBuffer: Buffer, filename = 'input.jpg', mimeType = 'image/jpeg'): Promise<string> {
	const token = getHfToken();
	const cleanSpaceUrl = spaceUrl.replace(/\/$/, '');

	const formData = new FormData();
	const blob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType });
	formData.append('files', blob, filename);

	// Try /gradio_api/upload first (Gradio 5 standard), fallback to /upload (Gradio 4)
	let res = await fetch(`${cleanSpaceUrl}/gradio_api/upload`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`
		},
		body: formData
	});

	if (res.status === 404) {
		const retryForm = new FormData();
		retryForm.append('files', new Blob([new Uint8Array(fileBuffer)], { type: mimeType }), filename);
		res = await fetch(`${cleanSpaceUrl}/upload`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`
			},
			body: retryForm
		});
	}

	if (!res.ok) {
		const err = await res.text();
		throw new Error(`Failed to upload file to Gradio Space (${res.status}): ${err}`);
	}

	const filePaths: string[] = await res.json();
	if (!filePaths || !filePaths.length) {
		throw new Error('Gradio Space did not return an uploaded file path');
	}

	return filePaths[0];
}

/**
 * Calls a Gradio 5 / Gradio 4 Space endpoint using the HTTP SSE queue protocol.
 */
export async function callGradioApi(spaceUrl: string, apiName: string, data: any[], timeoutMs = 300000): Promise<any> {
	const token = getHfToken();
	const cleanSpaceUrl = spaceUrl.replace(/\/$/, '');
	const cleanApiName = apiName.replace(/^\//, '');

	// 1. Submit job to queue (try /gradio_api/call/ first, fallback to /call/)
	let endpointUrl = `${cleanSpaceUrl}/gradio_api/call/${cleanApiName}`;
	let submitRes = await fetch(endpointUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		},
		body: JSON.stringify({ data })
	});

	if (submitRes.status === 404) {
		endpointUrl = `${cleanSpaceUrl}/call/${cleanApiName}`;
		submitRes = await fetch(endpointUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`
			},
			body: JSON.stringify({ data })
		});
	}

	if (!submitRes.ok) {
		const err = await submitRes.text();
		throw new Error(`Gradio API submission failed (${submitRes.status}): ${err}`);
	}

	const { event_id } = await submitRes.json();
	if (!event_id) {
		throw new Error('No event_id returned from Gradio Space');
	}

	// 2. Listen to the SSE stream until complete
	const streamUrl = `${endpointUrl}/${event_id}`;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const streamRes = await fetch(streamUrl, {
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'text/event-stream'
			},
			signal: controller.signal
		});

		if (!streamRes.ok) {
			const err = await streamRes.text();
			throw new Error(`Gradio stream connection failed (${streamRes.status}): ${err}`);
		}

		if (!streamRes.body) {
			throw new Error('No response stream body received from Gradio');
		}

		const reader = streamRes.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let finalResult: any = null;

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() || '';

			let currentEvent = '';

			for (const line of lines) {
				const trimmed = line.trim();
				if (trimmed.startsWith('event:')) {
					currentEvent = trimmed.replace('event:', '').trim();
				} else if (trimmed.startsWith('data:')) {
					const dataContent = trimmed.replace('data:', '').trim();
					if (currentEvent === 'complete') {
						try {
							finalResult = JSON.parse(dataContent);
						} catch (e) {
							finalResult = dataContent;
						}
					} else if (currentEvent === 'error') {
						throw new Error(`Gradio execution error: ${dataContent}`);
					}
				}
			}

			if (finalResult !== null) {
				break;
			}
		}

		if (finalResult === null) {
			throw new Error('Gradio stream closed without completing');
		}

		return finalResult;
	} finally {
		clearTimeout(timeout);
	}
}

/**
 * Downloads a generated file from a Gradio Space given its file path or object.
 */
export async function downloadGradioFile(spaceUrl: string, fileRef: any): Promise<Buffer> {
	const token = getHfToken();
	const cleanSpaceUrl = spaceUrl.replace(/\/$/, '');

	let downloadUrl = '';
	if (typeof fileRef === 'string') {
		downloadUrl = fileRef.startsWith('http') ? fileRef : `${cleanSpaceUrl}/gradio_api/file=${fileRef}`;
	} else if (fileRef && fileRef.url) {
		downloadUrl = fileRef.url;
	} else if (fileRef && fileRef.path) {
		downloadUrl = `${cleanSpaceUrl}/gradio_api/file=${fileRef.path}`;
	} else {
		throw new Error(`Invalid Gradio file reference: ${JSON.stringify(fileRef)}`);
	}

	let res = await fetch(downloadUrl, {
		headers: {
			Authorization: `Bearer ${token}`
		}
	});

	if (res.status === 404 && downloadUrl.includes('/gradio_api/file=')) {
		const fallbackUrl = downloadUrl.replace('/gradio_api/file=', '/file=');
		res = await fetch(fallbackUrl, {
			headers: {
				Authorization: `Bearer ${token}`
			}
		});
	}

	if (!res.ok) {
		throw new Error(`Failed to download result file from Gradio (${res.status})`);
	}

	const arrayBuffer = await res.arrayBuffer();
	return Buffer.from(arrayBuffer);
}
