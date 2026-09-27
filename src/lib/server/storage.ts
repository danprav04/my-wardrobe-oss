import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from '$env/dynamic/private';

const getStorageDir = () => {
	const base = env.STORAGE_PATH || process.env.STORAGE_PATH || './data';
	return path.resolve(base);
};

/**
 * Asserts that a resolved file path stays strictly within the storage directory.
 * Prevents directory traversal attacks via ../ sequences or absolute paths.
 */
export function assertPathWithinStorage(relativePath: string): string {
	const storageRoot = path.resolve(getStorageDir());
	const resolved = path.resolve(storageRoot, relativePath);
	if (!resolved.startsWith(storageRoot + path.sep) && resolved !== storageRoot) {
		throw new Error(`Security: Path traversal blocked for "${relativePath}"`);
	}
	return resolved;
}

/**
 * Sanitizes a filename by taking its basename and ensuring a safe file extension.
 */
export function sanitizeFilename(rawFilename: string): string {
	const base = path.basename(rawFilename);
	const clean = base.replace(/[^a-zA-Z0-9._-]/g, '_');
	return clean || `${crypto.randomUUID()}.jpg`;
}

export async function ensureStorageDirs() {
	const base = getStorageDir();
	await fs.mkdir(path.join(base, 'originals'), { recursive: true });
	await fs.mkdir(path.join(base, 'crops'), { recursive: true });
	await fs.mkdir(path.join(base, 'cutouts'), { recursive: true });
	await fs.mkdir(path.join(base, 'tryons'), { recursive: true });
	await fs.mkdir(path.join(base, 'portraits'), { recursive: true });
}

export async function saveLocalFile(
	subfolder: 'originals' | 'crops' | 'cutouts' | 'tryons' | 'portraits',
	filename: string,
	buffer: Buffer
): Promise<string> {
	await ensureStorageDirs();
	const safeFilename = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
	const relativePath = path.join(subfolder, safeFilename);
	const fullPath = assertPathWithinStorage(relativePath);
	await fs.writeFile(fullPath, buffer);
	return relativePath.replace(/\\/g, '/');
}

export async function readLocalFile(relativePath: string): Promise<Buffer> {
	const fullPath = assertPathWithinStorage(relativePath);
	return fs.readFile(fullPath);
}

export async function deleteLocalFile(relativePath: string): Promise<void> {
	try {
		const fullPath = assertPathWithinStorage(relativePath);
		await fs.unlink(fullPath);
	} catch (err: any) {
		if (err.code !== 'ENOENT') {
			console.error(`Error deleting file ${relativePath}:`, err);
		}
	}
}

export function getLocalFileUrl(relativePath: string): string {
	return `/api/storage/${relativePath}`;
}
