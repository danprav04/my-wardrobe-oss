import { redirect, type RequestHandler } from '@sveltejs/kit';
import { COOKIE_NAME, revokeSessionToken } from '$lib/server/auth';

export const GET: RequestHandler = async ({ cookies }) => {
	const token = cookies.get(COOKIE_NAME);
	if (token) {
		await revokeSessionToken(token);
	}
	cookies.delete(COOKIE_NAME, { path: '/' });
	redirect(303, '/login');
};

export const POST: RequestHandler = async ({ cookies }) => {
	const token = cookies.get(COOKIE_NAME);
	if (token) {
		await revokeSessionToken(token);
	}
	cookies.delete(COOKIE_NAME, { path: '/' });
	redirect(303, '/login');
};
