import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { verifyCredentials, createSessionToken, COOKIE_NAME, getCookieOptions, checkLoginRateLimit } from '$lib/server/auth';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.authenticated) {
		redirect(303, '/');
	}
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		const clientIp = getClientAddress();
		const rateLimit = checkLoginRateLimit(clientIp);

		if (!rateLimit.allowed) {
			const seconds = Math.ceil(rateLimit.retryAfterMs / 1000);
			return fail(429, {
				error: `Too many login attempts. Please wait ${seconds} seconds before trying again.`,
				username: ''
			});
		}

		const formData = await request.formData();
		const username = String(formData.get('username') || '').trim();
		const password = String(formData.get('password') || '');

		if (!username || !password) {
			return fail(400, {
				error: 'Please enter both your username and password.',
				username
			});
		}

		const isValid = verifyCredentials(username, password);

		if (!isValid) {
			return fail(401, {
				error: 'Invalid username or password. Please try again.',
				username
			});
		}

		// Create 7-day cryptographically signed session token
		const token = createSessionToken(username);
		cookies.set(COOKIE_NAME, token, getCookieOptions());

		redirect(303, '/');
	}
};
