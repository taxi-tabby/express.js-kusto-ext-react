import * as fs from 'fs';
import * as path from 'path';
import { discoverPages, generateEntrySource, buildClientBundle } from '../src/bundler';

const FIXTURES = path.join(__dirname, 'fixtures', 'pages');
const TMP = path.join(__dirname, '.tmp');

describe('discoverPages', () => {
    it('finds top-level and nested pages with correct keys/importPaths (filename order)', () => {
        const pages = discoverPages(FIXTURES);
        const keys = pages.map((p) => p.key);
        expect(keys).toContain('Home');
        expect(keys).toContain('admin/Dashboard');
        const home = pages.find((p) => p.key === 'Home')!;
        expect(home.importPath).toBe('./Home');
        const dash = pages.find((p) => p.key === 'admin/Dashboard')!;
        expect(dash.importPath).toBe('./admin/Dashboard');
    });

    it('returns [] for a missing directory', () => {
        expect(discoverPages(path.join(FIXTURES, 'nope'))).toEqual([]);
    });
});

describe('generateEntrySource', () => {
    it('imports every page, builds the registry, and mounts from window.__KUSTO_PAGE__', () => {
        const src = generateEntrySource([
            { key: 'Home', importPath: './Home' },
            { key: 'admin/Dashboard', importPath: './admin/Dashboard' },
        ]);
        expect(src).toContain('import P0 from "./Home";');
        expect(src).toContain('import P1 from "./admin/Dashboard";');
        expect(src).toContain('"Home": P0');
        expect(src).toContain('"admin/Dashboard": P1');
        expect(src).toContain('__KUSTO_PAGE__');
        expect(src).toContain('createRoot');
        expect(src).toContain('BrowserRouter');
    });

    it('hydrates when __KUSTO_SSR__ is set and falls back to createRoot otherwise', () => {
        const src = generateEntrySource([{ key: 'Home', importPath: './Home' }]);
        expect(src).toContain('hydrateRoot');
        expect(src).toContain('createRoot');
        expect(src).toContain('__KUSTO_SSR__');
        // hydrateRoot must be imported from react-dom/client alongside createRoot.
        expect(src).toMatch(/import\s*\{[^}]*hydrateRoot[^}]*\}\s*from\s*['"]react-dom\/client['"]/);
    });
});

describe('buildClientBundle (esbuild smoke)', () => {
    const outFile = path.join(TMP, 'client.js');
    afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

    it('bundles the fixture pages into a single browser file', async () => {
        const { pages, outFile: written } = await buildClientBundle({
            pagesDir: FIXTURES,
            outFile,
            production: false,
        });
        expect(pages.map((p) => p.key).sort()).toEqual(['Home', 'admin/Dashboard']);
        expect(fs.existsSync(written)).toBe(true);
        const content = fs.readFileSync(written, 'utf-8');
        expect(content.length).toBeGreaterThan(1000);
        expect(content).toContain('__KUSTO_PAGE__');
        expect(content).toContain('Hello'); // from Home.tsx
    });
});
