import { react } from '../src/reactExtension';

const noopLog = { Info: () => {}, Warn: () => {}, Error: () => {}, Debug: () => {} };
const tick = () => new Promise((r) => setTimeout(r, 20));

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
