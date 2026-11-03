import { expect, test as base } from '@playwright/test';

/**
 * Git Panther must work on closed networks, so the UI may only load files
 * from its own origin. Every test using this fixture fails if the page tries
 * to reach any other host; such requests are also aborted so they cannot hang.
 */
export const test = base.extend<{ externalRequests: string[] }>({
  externalRequests: [
    async ({ page, baseURL }, use) => {
      const ownOrigin = new URL(baseURL ?? 'http://127.0.0.1').origin;
      const external: string[] = [];
      await page.route('**/*', async (route) => {
        const url = route.request().url();
        const isLocal = url.startsWith(ownOrigin) || url.startsWith('data:');
        if (isLocal) {
          await route.continue();
        } else {
          external.push(url);
          await route.abort('blockedbyclient');
        }
      });
      await use(external);
      expect(external, 'the app must not contact any external host').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
