import * as fs from 'fs';
import * as path from 'path';
import { generateServerEntrySource, buildServerBundle } from '../src/serverBundle';

const FIXTURES = path.join(__dirname, 'fixtures', 'pages');
const TMP = path.join(__dirname, '.tmp-server');

describe('generateServerEntrySource', () => {
    it('imports every page, builds the registry, and exports renderPage using StaticRouter + renderToString', () => {
        const src = generateServerEntrySource([
            { key: 'Home', importPath: './Home' },
            { key: 'admin/Dashboard', importPath: './admin/Dashboard' },
        ]);
        expect(src).toContain('import P0 from "./Home";');
        expect(src).toContain('import P1 from "./admin/Dashboard";');
        expect(src).toContain('"Home": P0');
        expect(src).toContain('"admin/Dashboard": P1');
        expect(src).toContain('renderToString');
        expect(src).toContain('StaticRouter');
        // renderPage must be an export of the module.
        expect(src).toMatch(/export\s+function\s+renderPage/);
    });

    it('resolves StaticRouter defensively across react-router v6/v7 (no hard import of react-router-dom/server)', () => {
        const src = generateServerEntrySource([{ key: 'Home', importPath: './Home' }]);
        // react-router v7 dropped the react-router-dom/server subpath; a static top-level
        // import of it throws ERR_PACKAGE_PATH_NOT_EXPORTED at module load under v7.
        expect(src).not.toMatch(/import\s*\{[^}]*StaticRouter[^}]*\}\s*from\s*['"]react-router-dom\/server['"]/);
        // It must consult react-router (v7) and react-router-dom/server (v6) at runtime.
        expect(src).toContain("require('react-router')");
        expect(src).toContain("require('react-router-dom/server')");
    });
});

describe('buildServerBundle (esbuild smoke)', () => {
    const outFile = path.join(TMP, 'server.cjs');
    afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

    it('bundles the fixture pages into a requirable CJS module exporting renderPage', async () => {
        const { pages, outFile: written } = await buildServerBundle({
            pagesDir: FIXTURES,
            outFile,
            production: false,
        });
        expect(pages.map((p) => p.key).sort()).toEqual(['Home', 'admin/Dashboard']);
        expect(fs.existsSync(written)).toBe(true);

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require(written);
        expect(typeof mod.renderPage).toBe('function');

        const html = mod.renderPage('Home', { name: 'kusto' }, '/');
        expect(typeof html).toBe('string');
        expect(html).toContain('Hello');
        expect(html).toContain('kusto');
    });

    it('renderPage throws for an unknown page name', async () => {
        const { outFile: written } = await buildServerBundle({
            pagesDir: FIXTURES,
            outFile: path.join(TMP, 'server2.cjs'),
            production: false,
        });
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require(written);
        expect(() => mod.renderPage('DoesNotExist', {}, '/')).toThrow(/DoesNotExist/);
    });
});
