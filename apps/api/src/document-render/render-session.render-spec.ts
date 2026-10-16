import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import puppeteer, { type Browser } from 'puppeteer-core';
import { readSeedFiles } from '../design-system/design-system-seed';
import { DESIGN_SYSTEM_SEED_DIR } from '../design-system/design-system.constants';
import { assemble } from '../document-source/assemble';
import { judge } from './judge';
import { remedyOf } from './render-remedy';
import { browserlessEndpoint, renderDocumentSession } from './render-session';

/**
 * Test layer 4 (§11.2): the real render session against a real browser. It is
 * not part of `bun run check`. Run it against either:
 *
 * - a local Chrome: `CHROME_PATH=<chrome> bun run test:render`. Chrome is
 *   launched once and every render connects to it over its WebSocket.
 * - a Browserless instance (the one `docker compose up -d` starts):
 *   `BROWSERLESS_URL=http://localhost:3002 BROWSERLESS_TOKEN=local-browserless-token bun run test:render`.
 *   Every render connects through `browserlessEndpoint`, as production does.
 *
 * CHROME_PATH wins when both are set. Either way the renders exercise the same
 * `puppeteer.connect` session that runs against Browserless.
 */
const CHROME_PATH = process.env.CHROME_PATH;
const BROWSERLESS_URL = process.env.BROWSERLESS_URL;
const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN;
if (!CHROME_PATH && !(BROWSERLESS_URL && BROWSERLESS_TOKEN)) {
  throw new Error(
    'test:render needs a browser: set CHROME_PATH to a local Chrome executable, ' +
      'e.g. CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" bun run test:render, ' +
      'or set BROWSERLESS_URL and BROWSERLESS_TOKEN, ' +
      'e.g. BROWSERLESS_URL=http://localhost:3002 BROWSERLESS_TOKEN=local-browserless-token bun run test:render',
  );
}

const seeds = readSeedFiles(DESIGN_SYSTEM_SEED_DIR).map((seed) => ({
  id: seed.definition.id,
  definition: seed.definition,
  sample: readFileSync(join(dirname(seed.path), 'sample.html'), 'utf8'),
}));
const margin = seeds.find((seed) => seed.id === 'margin')!.definition;

const corpus = (name: string) =>
  readFileSync(join(__dirname, 'render-corpus', `${name}.html`), 'utf8');

/** A verdict, order-free: `code@page`, or `code` for a document-level finding. */
const verdict = (violations: { code: string; page?: number }[]) =>
  violations.map((v) => (v.page ? `${v.code}@${v.page}` : v.code)).sort();

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

let browser: Browser | undefined;

/** The WebSocket endpoint each render connects to. */
const endpoint = (): string =>
  CHROME_PATH
    ? browser!.wsEndpoint()
    : browserlessEndpoint(BROWSERLESS_URL!, BROWSERLESS_TOKEN!);

beforeAll(async () => {
  if (!CHROME_PATH) return;
  // The CI and sandbox user may be root, and outbound HTTPS may need the
  // environment's proxy; neither changes what is rendered.
  const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', ...(proxy ? [`--proxy-server=${proxy}`] : [])],
  });
});

afterAll(async () => {
  await browser?.close();
});

describe('renderDocumentSession', () => {
  describe.each(seeds)('seed $id', ({ definition, sample }) => {
    it('should render with no violations and one PDF page per page element', async () => {
      const result = await renderDocumentSession(
        endpoint(),
        definition,
        assemble(definition, sample),
      );

      expect(judge(definition, result.facts)).toEqual([]);
      expect(result.facts.timedOut).toBe(false);
      expect(result.refusedRequests).toEqual([]);
      expect(result.facts.faces.some((f) => f.status === 'loaded')).toBe(true);
      expect(result.facts.pages.length).toBe(
        (sample.match(/<section class="page"/g) ?? []).length,
      );
      expect(result.pageCount).toBe(result.facts.pages.length);
      expect(result.pdf).not.toBeNull();
      expect(result.cover.ok).toBe(true);
      if (result.cover.ok) {
        expect([...result.cover.png.subarray(0, 4)]).toEqual(PNG_SIGNATURE);
      }
      expect(result.usage.units).toBeGreaterThanOrEqual(1);
    });
  });

  describe('hostile and defect corpus', () => {
    it.each([
      ['egress', ['render.egress', 'render.egress', 'render.egress'], 'defect'],
      ['script', ['render.pages.blank@2'], 'repair'],
      ['safe-area', ['page.safeArea@1'], 'repair'],
      ['clipped', ['render.overflow.clipped@1'], 'repair'],
      ['overlap', ['render.overlap@1'], 'repair'],
      ['blank', ['render.pages.blank@2'], 'repair'],
      [
        'colour',
        ['icons.colors@1', 'palette.pairings@1', 'palette.pairings@2'],
        'repair',
      ],
      ['glyphs', ['render.fonts.fallback@1'], 'repair'],
      ['body-height', ['render.pdf.pageCount'], 'repair'],
      [
        'geometry',
        [
          'render.pages.geometry@1',
          'render.pages.geometry@2',
          'render.pdf.pageCount',
        ],
        'repair',
      ],
      ['font-failed', ['render.fonts.failed'], 'retry'],
    ] as const)(
      'should judge %s as exactly %j',
      async (name, expected, remedy) => {
        const result = await renderDocumentSession(
          endpoint(),
          margin,
          assemble(margin, corpus(name)),
        );
        const found = judge(margin, result.facts);

        expect(verdict(found)).toEqual([...expected].sort());
        expect(new Set(found.map((v) => remedyOf(v.code)))).toEqual(
          new Set([remedy]),
        );
        for (const v of found) {
          expect(v.line).toBeUndefined();
          if (v.page) expect(v.detail).toMatch(new RegExp(`^page ${v.page}: `));
        }
      },
    );

    it('should pair text with a backdrop drawn by a positioned ::before', async () => {
      const result = await renderDocumentSession(
        endpoint(),
        margin,
        assemble(margin, corpus('colour')),
      );
      const details = judge(margin, result.facts)
        .filter((v) => v.code === 'palette.pairings')
        .map((v) => v.detail);

      expect(details).toEqual([
        expect.stringMatching(
          /^page 1: p\.meta\.chip "New" sets grey on hairline \(\d\.\d\d:1\)/,
        ),
        expect.stringMatching(
          /^page 2: h1\.title "Save this for the next one\." sets ink on ink \(1\.00:1\)/,
        ),
      ]);
    });

    it('should name the refused requests when the document reaches out', async () => {
      const result = await renderDocumentSession(
        endpoint(),
        margin,
        assemble(margin, corpus('egress')),
      );

      expect([...result.refusedRequests].sort()).toEqual([
        'https://example.com/beacon.png',
        'https://example.com/extra.css',
        'https://example.com/pixel.gif',
      ]);
    });

    it('should report a timeout, and print nothing, when the deadline expires', async () => {
      const definition = seeds[0].definition;
      const result = await renderDocumentSession(
        endpoint(),
        definition,
        assemble(definition, seeds[0].sample),
        { deadlineMs: 1 },
      );

      expect(verdict(judge(definition, result.facts))).toEqual([
        'render.timeout',
      ]);
      expect(result.pdf).toBeNull();
      expect(result.pageCount).toBeNull();
      expect(result.cover.ok).toBe(false);
    });
  });
});
