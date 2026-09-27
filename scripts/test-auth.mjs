import http from 'node:http';
import { spawn } from 'node:child_process';

const PORT = 5174;
const BASE_URL = `http://localhost:${PORT}`;

async function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(urlPath, options = {}) {
	const res = await fetch(`${BASE_URL}${urlPath}`, {
		redirect: 'manual',
		...options
	});
	return res;
}

async function runTests() {
	console.log('--- Starting Auth Verification Test ---');

	// Start preview server
	console.log(`Starting preview server on port ${PORT}...`);
	const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
		shell: true,
		env: {
			...process.env,
			PORT: String(PORT),
			AUTH_USERNAME: 'admin',
			SESSION_SECRET: 'test_session_secret_for_automated_tests_must_be_over_32_chars',
			// Testing Scrypt hash of "test_password_123"
			AUTH_PASSWORD: 'scrypt:c1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6:27d0c7a54a741c5ea1c40138142fe1efbb0b3d3584c9a867498ce20239b1e056f0764ec548461eeaa65cfd4e4c67eeebf30d7dfb12dd5448d2a05b1bdebb2f24'
		}
	});

	server.stdout.on('data', (d) => {
		// console.log(`[Server] ${d}`);
	});
	server.stderr.on('data', (d) => {
		// console.error(`[Server Err] ${d}`);
	});

	let ready = false;
	for (let i = 0; i < 30; i++) {
		await sleep(1000);
		try {
			const res = await fetch(`${BASE_URL}/login`, { redirect: 'manual' });
			if (res.status === 200) {
				ready = true;
				break;
			}
		} catch (e) {
			// wait
		}
	}

	if (!ready) {
		console.error('Preview server failed to start in time');
		server.kill();
		process.exit(1);
	}

	console.log('Preview server is up and running.\n');

	let passed = 0;
	let failed = 0;

	function assert(testName, condition, detail = '') {
		if (condition) {
			console.log(`✅ [PASS] ${testName}`);
			passed++;
		} else {
			console.error(`❌ [FAIL] ${testName}: ${detail}`);
			failed++;
		}
	}

	try {
		// Test 1: Unauthenticated page request to / redirects to /login
		const homeRes = await request('/');
		assert('Unauthenticated / redirects to /login', homeRes.status === 303 && homeRes.headers.get('location') === '/login', `Status was ${homeRes.status}, location: ${homeRes.headers.get('location')}`);

		// Test 2: Unauthenticated request to /api/garments returns 401 JSON
		const apiRes = await request('/api/garments');
		const apiBody = await apiRes.json().catch(() => ({}));
		assert('Unauthenticated API endpoint returns 401', apiRes.status === 401 && apiBody.error === 'Unauthorized', `Status was ${apiRes.status}, body: ${JSON.stringify(apiBody)}`);

		// Test 3: CORS headers on unauthenticated 401 response
		assert('401 response includes CORS headers', apiRes.headers.get('access-control-allow-origin') === '*', `CORS header was ${apiRes.headers.get('access-control-allow-origin')}`);

		// Test 4: OPTIONS preflight to /api/garments returns 204
		const optionsRes = await request('/api/garments', { method: 'OPTIONS' });
		assert('OPTIONS preflight returns 204 with CORS', optionsRes.status === 204 && optionsRes.headers.get('access-control-allow-origin') === '*', `Status was ${optionsRes.status}`);

		// Test 5: /login renders 200 OK
		const loginRes = await request('/login');
		const loginHtml = await loginRes.text();
		assert('/login page renders 200 OK', loginRes.status === 200 && loginHtml.includes('Sign In'), `Status was ${loginRes.status}`);

		// Test 6: Invalid login attempt fails
		const badForm = new URLSearchParams();
		badForm.append('username', 'admin');
		badForm.append('password', 'wrong_password');
		const badLoginRes = await request('/login', {
			method: 'POST',
			headers: { 
				'Content-Type': 'application/x-www-form-urlencoded',
				'Origin': BASE_URL
			},
			body: badForm.toString()
		});
		const badText = await badLoginRes.text();
		console.log('Bad login response:', badLoginRes.status, badLoginRes.headers.get('location'), badText.slice(0, 150));
		assert('Invalid login returns 401 (or contains error)', badLoginRes.status === 401 || badText.includes('Invalid username or password'), `Status was ${badLoginRes.status}`);

		// Test 7: Valid login succeeds and sets wardrobe_session cookie
		const goodForm = new URLSearchParams();
		goodForm.append('username', 'admin');
		goodForm.append('password', 'test_password_123');
		const goodLoginRes = await request('/login', {
			method: 'POST',
			headers: { 
				'Content-Type': 'application/x-www-form-urlencoded',
				'Origin': BASE_URL
			},
			body: goodForm.toString()
		});

		const goodText = await goodLoginRes.text();
		const setCookie = goodLoginRes.headers.get('set-cookie');
		console.log('Good login response:', goodLoginRes.status, goodLoginRes.headers.get('location'), 'Set-Cookie:', setCookie);
		assert('Valid login redirects or succeeds', (goodLoginRes.status === 303 || goodLoginRes.status === 200) && Boolean(setCookie), `Status was ${goodLoginRes.status}`);
		assert('Login sets HttpOnly wardrobe_session cookie', setCookie && setCookie.includes('wardrobe_session=') && setCookie.includes('HttpOnly'), `Cookie header: ${setCookie}`);

		const sessionMatch = setCookie.match(/wardrobe_session=([^;]+)/);
		const sessionCookie = sessionMatch ? sessionMatch[1] : '';

		// Test 8: Authenticated request to / with session cookie succeeds
		const authHomeRes = await request('/', {
			headers: { Cookie: `wardrobe_session=${sessionCookie}` }
		});
		assert('Authenticated request to / returns 200', authHomeRes.status === 200, `Status was ${authHomeRes.status}`);

		// Test 9: Authenticated user accessing /login is redirected to /
		const authLoginRes = await request('/login', {
			headers: { Cookie: `wardrobe_session=${sessionCookie}` }
		});
		assert('Authenticated user on /login redirects to /', authLoginRes.status === 303 && authLoginRes.headers.get('location') === '/', `Status was ${authLoginRes.status}`);

		// Test 10: Authenticated request to /logout revokes token & deletes cookie
		const logoutRes = await request('/logout', {
			headers: { Cookie: `wardrobe_session=${sessionCookie}` }
		});
		const logoutCookie = logoutRes.headers.get('set-cookie') || '';
		assert('Logout redirects to /login', logoutRes.status === 303 && logoutRes.headers.get('location') === '/login', `Status was ${logoutRes.status}`);
		assert('Logout clears wardrobe_session cookie', logoutCookie.includes('wardrobe_session=;') || logoutCookie.includes('Max-Age=0') || logoutCookie.includes('expires='), `Logout cookie: ${logoutCookie}`);

		// Test 11: Re-using the revoked session token fails
		const reusedRes = await request('/', {
			headers: { Cookie: `wardrobe_session=${sessionCookie}` }
		});
		assert('Revoked token is rejected on /', reusedRes.status === 303 && reusedRes.headers.get('location') === '/login', `Status was ${reusedRes.status}`);

	} catch (e) {
		console.error('Test execution error:', e);
		failed++;
	} finally {
		console.log(`\nResults: ${passed} passed, ${failed} failed.`);
		server.kill();
		process.exit(failed === 0 ? 0 : 1);
	}
}

runTests();
