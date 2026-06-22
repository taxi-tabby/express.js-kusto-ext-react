import * as fs from 'fs';
import * as path from 'path';
import { react } from '../src/reactExtension';
import * as serverBundleModule from '../src/serverBundle';

const noopLog = { Info: () => {}, Warn: () => {}, Error: () => {}, Debug: () => {} };
const tick = () => new Promise((r) => setTimeout(r, 20));

/** Invoke GET_REACT and return the HTML the handler sends. */
async function renderRoute(ext: any, component: string, routeOptions?: any, req: any = {}): Promise<string> {
    const getMock = jest.fn();
    const ctx: any = { router: { get: getMock }, basePath: '', registerDocumentation: jest.fn() };
    ext.routerMethods.GET_REACT(ctx, component, routeOptions);
    const handler = getMock.mock.calls[0][1];
    const res: any = { status: jest.fn(() => res), type: jest.fn(() => res), send: jest.fn() };
    handler(req, res, (e: any) => { throw e; });
    await tick();
    return res.send.mock.calls[0][0] as string;
}

describe('react() extension', () => {
    it('returns a structurally valid KustoExtension', () => {
        const ext = react();
        expect(ext.name).toBe('@expressjs-kusto/react');
        expect(typeof ext.version).toBe('string');
        expect(typeof ext.routerMethods?.GET_REACT).toBe('function');
        expect(typeof ext.onInit).toBe('function');
        expect(typeof ext.onBuild).toBe('function');
    });

    it('GET_REACT registers a GET route and OpenAPI doc, and the handler serves the page shell', async () => {
        const ext = react();
        const getMock = jest.fn();
        const docMock = jest.fn();
        const ctx: any = { router: { get: getMock }, basePath: '', registerDocumentation: docMock };

        ext.routerMethods!.GET_REACT(ctx, 'Home', { props: { name: 'kusto' }, title: 'Home Title' });

        expect(getMock).toHaveBeenCalledTimes(1);
        const [routePath, handler] = getMock.mock.calls[0];
        expect(routePath).toBe('/');
        expect(docMock).toHaveBeenCalledWith('GET', '/', expect.objectContaining({ summary: expect.any(String) }));

        const res: any = { status: jest.fn(() => res), type: jest.fn(() => res), send: jest.fn() };
        handler({}, res, (e: any) => { throw e; });
        await tick();

        expect(res.status).toHaveBeenCalledWith(200);
        const html = res.send.mock.calls[0][0] as string;
        expect(html).toContain('window.__KUSTO_PAGE__="Home"');
        expect(html).toContain('"name":"kusto"');
        expect(html).toContain('<title>Home Title</title>');
    });

    it('GET_REACT links the Tailwind stylesheet by default', async () => {
        const ext = react({ mountPath: '/r' });
        const getMock = jest.fn();
        const ctx: any = { router: { get: getMock }, basePath: '', registerDocumentation: jest.fn() };
        ext.routerMethods!.GET_REACT(ctx, 'Home');
        const handler = getMock.mock.calls[0][1];
        const res: any = { status: jest.fn(() => res), type: jest.fn(() => res), send: jest.fn() };
        handler({}, res, (e: any) => { throw e; });
        await tick();
        const html = res.send.mock.calls[0][0] as string;
        expect(html).toContain('<link rel="stylesheet" href="/r/client.css" />');
    });

    it('GET_REACT omits the stylesheet when tailwind is disabled', async () => {
        const ext = react({ mountPath: '/r', tailwind: false });
        const getMock = jest.fn();
        const ctx: any = { router: { get: getMock }, basePath: '', registerDocumentation: jest.fn() };
        ext.routerMethods!.GET_REACT(ctx, 'Home');
        const handler = getMock.mock.calls[0][1];
        const res: any = { status: jest.fn(() => res), type: jest.fn(() => res), send: jest.fn() };
        handler({}, res, (e: any) => { throw e; });
        await tick();
        const html = res.send.mock.calls[0][0] as string;
        expect(html).not.toContain('rel="stylesheet"');
    });

    it('GET_REACT throws on a missing/invalid component name', () => {
        const ext = react();
        const ctx: any = { router: { get: jest.fn() }, registerDocumentation: jest.fn() };
        expect(() => ext.routerMethods!.GET_REACT(ctx, '' as any)).toThrow(/page component name/);
    });

    it('onInit mounts static serving for the built assets', async () => {
        const ext = react({ production: true, mountPath: '/assets' }); // production: skip dev rebuild
        const useMock = jest.fn();
        const ctx: any = { app: { use: useMock }, config: {}, registerMiddleware: () => {}, log: noopLog };
        await ext.onInit!(ctx);
        expect(useMock).toHaveBeenCalledTimes(1);
        expect(useMock.mock.calls[0][0]).toBe('/assets');
        expect(typeof useMock.mock.calls[0][1]).toBe('function'); // express.static middleware
    });

    it('onBuild warns and no-ops when the pages directory is absent', async () => {
        const ext = react({ pagesDir: 'does/not/exist' });
        const warn = jest.fn();
        const ctx: any = { rootDir: process.cwd(), appDir: process.cwd(), isProduction: true, log: { ...noopLog, Warn: warn } };
        await ext.onBuild!(ctx);
        expect(warn).toHaveBeenCalled();
    });
});

describe('react() SSR', () => {
    it('default (no ssr option) renders the CSR shell — unchanged behavior', async () => {
        const ext = react({ production: true });
        const html = await renderRoute(ext, 'Home', { props: { name: 'kusto' } });
        expect(html).toContain('window.__KUSTO_SSR__=false');
        expect(html).toContain('<div id="root"></div>');
    });

    it('falls back to CSR when ssr is enabled but no server bundle is loaded', async () => {
        // production: true skips the dev build, so the server renderer is never loaded.
        const ext = react({ ssr: true, production: true });
        const html = await renderRoute(ext, 'Home', { props: { name: 'kusto' } }, { originalUrl: '/' });
        expect(html).toContain('window.__KUSTO_SSR__=false');
        expect(html).toContain('<div id="root"></div>');
    });

    describe('with a built + loaded server bundle (integration)', () => {
        // pagesDir resolves to test/fixtures/pages: resolve(cwd, 'src/app', '../../test/fixtures/pages').
        const PAGES_REL = '../../test/fixtures/pages';
        const OUT_REL = 'test/.tmp-ext-ssr';
        const clientDir = path.resolve(process.cwd(), OUT_REL);
        const serverDir = path.resolve(process.cwd(), 'test', '.tmp-ext-ssr-server');
        const warnSpy = jest.fn();
        let ext: any;

        beforeAll(async () => {
            ext = react({ ssr: true, tailwind: false, pagesDir: PAGES_REL, outDir: OUT_REL });
            const initCtx: any = {
                app: { use: jest.fn() },
                config: {},
                registerMiddleware: () => {},
                log: { ...noopLog, Warn: warnSpy },
            };
            await ext.onInit(initCtx);
        });

        afterAll(() => {
            fs.rmSync(clientDir, { recursive: true, force: true });
            fs.rmSync(serverDir, { recursive: true, force: true });
        });

        beforeEach(() => warnSpy.mockClear());

        it('server-renders the page into #root and flags hydration', async () => {
            const html = await renderRoute(ext, 'Home', { props: { name: 'kusto' } }, { originalUrl: '/' });
            expect(html).toContain('window.__KUSTO_SSR__=true');
            expect(html).toContain('Hello');
            expect(html).toContain('kusto');
            // The client bundle still loads for hydration.
            expect(html).toContain('defer></script>');
        });

        it('per-route ssr:false overrides the global ssr:true (CSR for that route)', async () => {
            const html = await renderRoute(ext, 'Home', { ssr: false, props: { name: 'kusto' } }, { originalUrl: '/' });
            expect(html).toContain('window.__KUSTO_SSR__=false');
            expect(html).toContain('<div id="root"></div>');
        });

        it('falls back to CSR with a warning when the SSR render throws', async () => {
            // 'Nope' is not in the registry, so renderPage throws → caught → CSR fallback.
            const html = await renderRoute(ext, 'Nope', { props: {} }, { originalUrl: '/' });
            expect(html).toContain('window.__KUSTO_SSR__=false');
            expect(html).toContain('<div id="root"></div>');
            expect(warnSpy).toHaveBeenCalled();
        });
    });
});

describe('react() SSR — lazy server-bundle loading (backward compat)', () => {
    const cwd = process.cwd();
    const OUT_REL = 'test/.tmp-ext-lazy';
    const clientDir = path.resolve(cwd, OUT_REL);
    const serverDir = path.resolve(cwd, 'test', '.tmp-ext-lazy-server');
    const serverFile = path.join(serverDir, 'server.cjs');
    const warnSpy = jest.fn();
    let ext: any;
    let initWarnCount = -1;

    beforeAll(async () => {
        fs.mkdirSync(serverDir, { recursive: true });
        // A server bundle that throws when require()'d — loading it MUST warn + fall back to CSR.
        fs.writeFileSync(serverFile, 'throw new Error("boom at require time");\n');
        ext = react({ ssr: false, production: true, tailwind: false, outDir: OUT_REL });
        await ext.onInit({ app: { use: jest.fn() }, config: {}, registerMiddleware: () => {}, log: { ...noopLog, Warn: warnSpy } });
        initWarnCount = warnSpy.mock.calls.length;
    });

    afterAll(() => {
        fs.rmSync(serverDir, { recursive: true, force: true });
        fs.rmSync(clientDir, { recursive: true, force: true });
    });

    beforeEach(() => warnSpy.mockClear());

    it('does not require the server bundle at onInit (CSR-only projects never run page code in Node)', () => {
        expect(initWarnCount).toBe(0);
    });

    it('a CSR route never triggers a server-bundle load', async () => {
        const html = await renderRoute(ext, 'Home', { props: {} }, { originalUrl: '/' });
        expect(html).toContain('window.__KUSTO_SSR__=false');
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('a per-route ssr:true request loads the bundle and falls back to CSR with a warning when require throws', async () => {
        const html = await renderRoute(ext, 'Home', { ssr: true, props: {} }, { originalUrl: '/' });
        expect(html).toContain('window.__KUSTO_SSR__=false');
        expect(warnSpy).toHaveBeenCalled();
    });
});

describe('react() SSR — diagnostics & production wiring', () => {
    const cwd = process.cwd();

    it('warns at onInit when ssr is enabled globally but no server bundle exists', async () => {
        const warn = jest.fn();
        const OUT = 'test/.tmp-ext-missing';
        const ext = react({ ssr: true, production: true, tailwind: false, outDir: OUT });
        await ext.onInit!({ app: { use: jest.fn() }, config: {}, registerMiddleware: () => {}, log: { ...noopLog, Warn: warn } } as any);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('no server bundle'));
        fs.rmSync(path.resolve(cwd, OUT), { recursive: true, force: true });
        fs.rmSync(path.resolve(cwd, 'test', '.tmp-ext-missing-server'), { recursive: true, force: true });
    });

    it('falls back to CSR with a warning when the server bundle lacks a renderPage export', async () => {
        const warn = jest.fn();
        const OUT = 'test/.tmp-ext-noexport';
        const serverDir = path.resolve(cwd, 'test', '.tmp-ext-noexport-server');
        fs.mkdirSync(serverDir, { recursive: true });
        fs.writeFileSync(path.join(serverDir, 'server.cjs'), 'module.exports = {};\n');
        const ext = react({ ssr: true, production: true, tailwind: false, outDir: OUT });
        await ext.onInit!({ app: { use: jest.fn() }, config: {}, registerMiddleware: () => {}, log: { ...noopLog, Warn: warn } } as any);
        warn.mockClear();
        const html = await renderRoute(ext, 'Home', { ssr: true, props: {} }, { originalUrl: '/' });
        expect(html).toContain('window.__KUSTO_SSR__=false');
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('did not export renderPage'));
        fs.rmSync(path.resolve(cwd, OUT), { recursive: true, force: true });
        fs.rmSync(serverDir, { recursive: true, force: true });
    });

    it('onInit resolves and warns (does not crash) when the server bundle build fails', async () => {
        const spy = jest.spyOn(serverBundleModule, 'buildServerBundle').mockRejectedValue(new Error('boom'));
        const warn = jest.fn();
        const OUT = 'test/.tmp-ext-buildfail';
        const ext = react({ ssr: true, tailwind: false, pagesDir: '../../test/fixtures/pages', outDir: OUT });
        await expect(
            ext.onInit!({ app: { use: jest.fn() }, config: {}, registerMiddleware: () => {}, log: { ...noopLog, Warn: warn } } as any),
        ).resolves.toBeUndefined();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('server bundle build failed'), expect.anything());
        spy.mockRestore();
        fs.rmSync(path.resolve(cwd, OUT), { recursive: true, force: true });
        fs.rmSync(path.resolve(cwd, 'test', '.tmp-ext-buildfail-server'), { recursive: true, force: true });
    });

    it('onBuild writes the server bundle to the sibling dir, and a fresh production instance loads + renders it from disk', async () => {
        const OUT_REL = 'test/.tmp-ext-prod';
        const clientDir = path.resolve(cwd, OUT_REL);
        const serverDir = path.resolve(cwd, 'test', '.tmp-ext-prod-server');
        const serverFile = path.join(serverDir, 'server.cjs');
        try {
            // 1) Build via onBuild (uses appDir for pages, rootDir for output paths).
            const buildExt = react({ ssr: true, tailwind: false, pagesDir: 'fixtures/pages', outDir: OUT_REL });
            await buildExt.onBuild!({ rootDir: cwd, appDir: path.resolve(cwd, 'test'), isProduction: true, log: noopLog } as any);
            expect(fs.existsSync(serverFile)).toBe(true);
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            expect(typeof require(serverFile).renderPage).toBe('function');

            // 2) A fresh production instance must NOT build, then load-from-disk on the first SSR request.
            const runExt = react({ ssr: true, production: true, tailwind: false, pagesDir: '../../test/fixtures/pages', outDir: OUT_REL });
            await runExt.onInit!({ app: { use: jest.fn() }, config: {}, registerMiddleware: () => {}, log: noopLog } as any);
            const html = await renderRoute(runExt, 'Home', { props: { name: 'kusto' } }, { originalUrl: '/' });
            expect(html).toContain('window.__KUSTO_SSR__=true');
            expect(html).toContain('Hello');
            expect(html).toContain('kusto');
        } finally {
            fs.rmSync(clientDir, { recursive: true, force: true });
            fs.rmSync(serverDir, { recursive: true, force: true });
        }
    });
});
