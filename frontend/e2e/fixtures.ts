import { test as base, type APIRequestContext, type Page } from '@playwright/test';

import { E2E_SESSION, OWN_ACCOUNT_SLOT, createIdentity, type Identity } from './db';

const API_BASE = 'http://127.0.0.1:3000';

// All tests run as the e2e identity created in global-setup: the session cookie is set on
// the browser context, and `api` is a request context carrying the same cookie for
// arranging state directly against the backend.
export const test = base.extend<{ api: APIRequestContext }>({
	context: async ({ context }, use) => {
		await context.addCookies([
			{ name: 'ws_session', value: E2E_SESSION, domain: 'localhost', path: '/' },
		]);
		await use(context);
	},
	api: async ({ playwright }, use) => {
		const api = await playwright.request.newContext({
			baseURL: API_BASE,
			extraHTTPHeaders: { cookie: `ws_session=${E2E_SESSION}` },
		});
		await use(api);
		await api.dispose();
	},
});

/**
 * For specs that change the account itself (its characters, which one is preferred, or
 * whether it is online): every worker signs in as an identity of its own, so a spec in
 * another worker never sees the change halfway through. `account` says which one.
 */
export const ownAccountTest = base.extend<{ api: APIRequestContext }, { account: Identity }>({
	account: [
		// oxlint-disable-next-line no-empty-pattern -- Playwright reads the fixtures from it.
		async ({}, use, workerInfo) => {
			await use(await createIdentity(OWN_ACCOUNT_SLOT + workerInfo.parallelIndex));
		},
		{ scope: 'worker' },
	],
	context: async ({ context, account }, use) => {
		await context.addCookies([
			{ name: 'ws_session', value: account.session, domain: 'localhost', path: '/' },
		]);
		await use(context);
	},
	api: async ({ playwright, account }, use) => {
		const api = await playwright.request.newContext({
			baseURL: API_BASE,
			extraHTTPHeaders: { cookie: `ws_session=${account.session}` },
		});
		await use(api);
		await api.dispose();
	},
});

export { expect } from '@playwright/test';

/** The session the page's browser context signs in with. */
async function pageSession(page: Page): Promise<string> {
	const cookies = await page.context().cookies('http://localhost:5173');
	return cookies.find((c) => c.name === 'ws_session')?.value ?? E2E_SESSION;
}

/**
 * A menu animates in, and an action on something still moving is not just late. Playwright
 * retries it, and from the third try on it scrolls the page to dodge whatever might be in
 * the way. A map page scrolls, and a canvas menu is anchored to the viewport: it snaps
 * back after the scroll, out from under the pointer, and a submenu opened by hovering
 * closes half a second later with the test still reaching for it. On a busy runner that
 * half second is not enough.
 *
 * Without the animation no menu is caught moving, so nothing is retried. Menus only: a
 * popover or a dialog focuses a field as it opens, and the time its animation takes is
 * what lets that happen before a test types.
 *
 * Added once the page is hydrated, since a head it has yet to take over is not ours to
 * add to.
 */
async function stillMenus(page: Page) {
	await page.evaluate(() => {
		if (document.getElementById('e2e-still-menus')) return;
		const style = document.createElement('style');
		style.id = 'e2e-still-menus';
		style.textContent =
			'[role="menu"] { animation-duration: 0s !important; animation-delay: 0s !important; }';
		document.head.append(style);
	});
}

/**
 * Hydrated, and on a map page past the loader: it holds until the graph and the panel
 * arrangement have both arrived, or says why the map cannot be shown.
 *
 * A map that is shown also has its socket up by then. The page is rendered from what the
 * server read, and only a reconnect refetches: a change made between that read and the
 * socket opening is never heard of, so a test that arranges something right after
 * navigating would wait for it for ever.
 */
async function settled(page: Page) {
	await page.waitForSelector('html[data-hydrated="true"]');
	await stillMenus(page);
	// A map's own page, under its slug (`/maps/home-chain-42`) or a bare id, and not one of
	// its settings pages.
	if (/^\/maps\/(?:[^/]+-)?\d+$/.test(new URL(page.url()).pathname)) {
		const shown = await page.waitForSelector(
			'[data-testid="panel-grid"], [data-testid="map-error"], [data-testid="error-page"]',
		);
		if ((await shown.getAttribute('data-testid')) === 'panel-grid') {
			await page.waitForSelector('[data-testid="socket-dot"]:not([data-state="connecting"])');
		}
	}
}

/**
 * Navigate and wait until the page is hydrated (controls are interactive).
 *
 * A map you have not been through the introduction on opens it as a modal over everything,
 * so this marks it done first, for whoever the page is signed in as. Pass
 * `{ introduction: true }` to leave it alone, which is what the introduction's own spec does.
 */
export async function gotoApp(page: Page, path: string, options: { introduction?: boolean } = {}) {
	const map = /\/maps\/(\d+)(\?|$)/.exec(path);
	if (map && !options.introduction) {
		// The API is a different host from the app, so the context cookie is not sent with it.
		await page.request.post(`${API_BASE}/api/maps/${map[1]}/settings/user`, {
			headers: { cookie: `ws_session=${await pageSession(page)}` },
			data: { introduction_confirmed: true },
		});
	}
	await page.goto(path);
	await settled(page);
}

/**
 * Reload and wait the same way `gotoApp` does: the server-rendered page is on screen before
 * it answers clicks, and a map before its panels are arranged.
 */
export async function reloadApp(page: Page) {
	await page.reload();
	await settled(page);
}

/**
 * The id a create endpoint answers with.
 *
 * Every arrangement step in these tests posts something and needs the id back, and a
 * response body is untyped by nature. Reading it in one place means one checked claim
 * rather than sixty unchecked ones, and a body that is not what we expect fails here
 * naming the response instead of somewhere later as a mysterious undefined.
 */
export async function createdId(response: import('@playwright/test').APIResponse): Promise<number> {
	const body: unknown = await response.json();
	if (typeof body !== 'object' || body === null || !('id' in body)) {
		throw new Error(`expected a body with an id, got ${JSON.stringify(body)}`);
	}
	// SAFETY: `id` is present, and checked to be a number, immediately above.
	const { id } = body as { id: unknown };
	if (typeof id !== 'number') {
		throw new Error(`expected a numeric id, got ${JSON.stringify(id)}`);
	}
	return id;
}
