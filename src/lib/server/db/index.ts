import fs from 'node:fs';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { env } from '$env/dynamic/private';
import { building } from '$app/environment';

export function getDatabaseConnectionString(): string {
	let url = (env.DATABASE_URL || process.env.DATABASE_URL || '').trim();
	if (!url) {
		if (building) {
			return 'postgres://placeholder:placeholder@localhost:5432/placeholder';
		}
		throw new Error('DATABASE_URL environment variable is required but not configured.');
	}

	// Inside a Docker container, localhost refers to the container itself.
	// Map to my-wardrobe-db:5432 to reach the dedicated container on my-wardrobe-net.
	const isInsideDocker = fs.existsSync('/.dockerenv') || Boolean(process.env.CONTAINER_NAME);
	if (isInsideDocker) {
		url = url
			.replace('@localhost:5432', '@my-wardrobe-db:5432')
			.replace('@127.0.0.1:5432', '@my-wardrobe-db:5432');
	}

	return url;
}

// Keep connection pool conservative (max 3 connections) to fit inside 1GB RAM budget
export const client = postgres(getDatabaseConnectionString(), {
	max: 3,
	idle_timeout: 20,
	connect_timeout: 10
});

export const db = drizzle(client, { schema });

