import * as path from 'path';
import * as fs from 'fs';
import type { Request, Response, NextFunction } from 'express';
import type {
    KustoExtension,
    KustoRouterContext,
    KustoExtensionInitContext,
    KustoExtensionBuildContext,
    ReactExtensionOptions,
    ReactRouteOptions,
    KustoLog,
} from './types';
import { renderShell, toSerializableProps } from './shell';
import { buildClientBundle } from './bundler';
import { buildServerBundle, type RenderPage } from './serverBundle';
import { buildCss } from './tailwind';

const DEFAULTS = {
    pagesDir: 'views',
    mountPath: '/__kusto_react',
    outDir: '.kusto/react',
    title: 'Kusto React',
    cssEntry: 'views/app.css',
};

/** Normalize a mount path to a leading slash and no trailing slash. */
function normalizeMount(mount: string): string {
    let s = mount.startsWith('/') ? mount : `/${mount}`;
    if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
    return s;
}

/**
 * Absolute path of the server (SSR) bundle. It is written to a sibling of the
 * statically-served client `outDir` (e.g. `.kusto/react` -> `.kusto/react-server`)
 * so the Node-side server code is never reachable at a public URL.
 */
function serverOutFileAbs(root: string, outDirRel: string): string {
    const clientDir = path.resolve(root, outDirRel);
    return path.resolve(path.dirname(clientDir), `${path.basename(clientDir)}-server`, 'server.cjs');
}

/** Fallback logger for the rare case a request is served before onInit captured the framework log. */
const CONSOLE_LOG: KustoLog = {
    Info: (m) => console.info(m),
    Warn: (m, meta) => (meta === undefined ? console.warn(m) : console.warn(m, meta)),
    Error: (m, meta) => (meta === undefined ? console.error(m) : console.error(m, meta)),
};

/** Require the built server bundle and return its `renderPage` export, or `null` if unavailable. */
function loadServerRenderer(absFile: string, log: KustoLog): RenderPage | null {
    if (!fs.existsSync(absFile)) return null;
    try {
        const resolved = require.resolve(absFile);
        delete require.cache[resolved]; // pick up a freshly rebuilt bundle (e.g. across re-init)
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require(absFile);
        if (typeof mod.renderPage === 'function') return mod.renderPage as RenderPage;
        log.Warn('[kusto-react] server bundle did not export renderPage; SSR will fall back to CSR');
        return null;
    } catch (error) {
        log.Warn('[kusto-react] server bundle could not be loaded; SSR will fall back to CSR', { error });
        return null;
    }
}

/**
 * React rendering extension for Express.js-Kusto (CSR v1).
 *
 * Activate it from `src/app/extensions/react.ts`:
 *   import { react } from '@expressjs-kusto/react';
 *   export default react();
 *
 * Then in any route file: `router.GET_REACT('Home')`.
 */
export function react(options: ReactExtensionOptions = {}): KustoExtension {
    const pagesDirRel = options.pagesDir ?? DEFAULTS.pagesDir;
    const mountPath = normalizeMount(options.mountPath ?? DEFAULTS.mountPath);
    const outDirRel = options.outDir ?? DEFAULTS.outDir;
    const defaultTitle = options.title ?? DEFAULTS.title;
    const head = options.head;
    const tailwindEnabled = options.tailwind ?? true;
    const cssEntryRel = options.cssEntry ?? DEFAULTS.cssEntry;
    const globalSsr = options.ssr ?? false;
    const clientUrl = `${mountPath}/client.js`;
    const cssUrl = tailwindEnabled ? `${mountPath}/client.css` : undefined;

    // SSR runtime state (per react() instance). The server bundle is loaded LAZILY — only the
    // first request that actually needs SSR triggers the require(). This preserves the CSR-only
    // guarantee: a project that never uses SSR never executes page code on the Node side at boot.
    let extLog: KustoLog | null = null;
    let serverRender: RenderPage | null = null;
    let serverRenderLoaded = false;
    const getServerRender = (): RenderPage | null => {
        if (!serverRenderLoaded) {
            serverRenderLoaded = true;
            serverRender = loadServerRenderer(serverFileAbs(), extLog ?? CONSOLE_LOG);
        }
        return serverRender;
    };

    const isProduction = (): boolean => options.production ?? process.env.NODE_ENV === 'production';
    const appDirAbs = (): string => path.resolve(process.cwd(), 'src', 'app');
    const pagesDirAbs = (): string => path.resolve(appDirAbs(), pagesDirRel);
    const outFileAbs = (): string => path.resolve(process.cwd(), outDirRel, 'client.js');
    const serverFileAbs = (): string => serverOutFileAbs(process.cwd(), outDirRel);
    const cssEntryAbs = (): string => path.resolve(appDirAbs(), cssEntryRel);
    const cssOutFileAbs = (): string => path.resolve(process.cwd(), outDirRel, 'client.css');
    const assetsDirAbs = (): string => path.resolve(process.cwd(), outDirRel);

    return {
        name: '@expressjs-kusto/react',
        version: '0.1.0',

        routerMethods: {
            GET_REACT(ctx: KustoRouterContext, component: string, routeOptions?: ReactRouteOptions): void {
                if (!component || typeof component !== 'string') {
                    throw new Error('[kusto-react] GET_REACT requires a page component name, e.g. GET_REACT("Home").');
                }
                const effectiveSsr = routeOptions?.ssr ?? globalSsr;
                const serveShell = async (req: Request, res: Response): Promise<void> => {
                    const props = typeof routeOptions?.props === 'function'
                        ? await routeOptions.props(req)
                        : (routeOptions?.props ?? {});
                    let ssrHtml: string | undefined;
                    if (effectiveSsr) {
                        const render = getServerRender();
                        if (render) {
                            try {
                                // Render from the same JSON-serialized props the client will hydrate from,
                                // so non-JSON-safe values (Date, undefined, ...) don't cause hydration mismatches.
                                const renderProps = toSerializableProps(props as Record<string, unknown>);
                                ssrHtml = render(component, renderProps, req.originalUrl ?? '/');
                            } catch (error) {
                                (extLog ?? CONSOLE_LOG).Warn(
                                    `[kusto-react] SSR render failed for page "${component}"; falling back to CSR`,
                                    { error },
                                );
                                ssrHtml = undefined;
                            }
                        }
                    }
                    res.status(200).type('html').send(renderShell({
                        page: component,
                        props,
                        clientSrc: clientUrl,
                        cssSrc: cssUrl,
                        title: routeOptions?.title ?? defaultTitle,
                        head,
                        ssrHtml,
                    }));
                };
                ctx.router.get('/', (req: Request, res: Response, next: NextFunction) => {
                    serveShell(req, res).catch(next);
                });
                // This is an HTML page route, not a JSON API. Declaring contentType: 'html'
                // makes the framework document it as a text/html page route (no response
                // schema needed); the docs flexibly recognize it as an extension-added route.
                ctx.registerDocumentation('GET', '/', {
                    summary: routeOptions?.summary ?? `React page: ${component}`,
                    contentType: 'html',
                });
            },
        },

        async onInit(ctx: KustoExtensionInitContext): Promise<void> {
            extLog = ctx.log;
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const express = require('express');
            // In dev, build the client + server bundles on boot (in parallel) so pages
            // render without a separate build step. Both failures degrade gracefully.
            if (!isProduction()) {
                const clientBuild = buildClientBundle({ pagesDir: pagesDirAbs(), outFile: outFileAbs(), production: false })
                    .then(({ pages }) => ctx.log.Info(`React client bundle built for dev: ${pages.length} page(s)`))
                    .catch((error) => ctx.log.Warn('React client bundle build failed on boot; pages may not render', { error }));
                const serverBuild = buildServerBundle({ pagesDir: pagesDirAbs(), outFile: serverFileAbs(), production: false })
                    .then(({ pages }) => ctx.log.Info(`React server bundle built for dev: ${pages.length} page(s)`))
                    .catch((error) => ctx.log.Warn('React server bundle build failed on boot; SSR will fall back to CSR', { error }));
                await Promise.all([clientBuild, serverBuild]);
                if (tailwindEnabled) {
                    try {
                        await buildCss({
                            cssEntry: cssEntryAbs(),
                            outFile: cssOutFileAbs(),
                            baseDir: pagesDirAbs(),
                            production: false,
                        });
                        ctx.log.Info('Tailwind CSS built for dev');
                    } catch (error) {
                        ctx.log.Warn('Tailwind CSS build failed on boot; styles may be missing', { error });
                    }
                }
            }
            // The server renderer is loaded lazily on the first SSR request (see getServerRender),
            // so a CSR-only project never require()s page code on the Node side. When SSR is enabled
            // globally but no bundle exists, surface it once so a misconfigured deploy is observable.
            if (globalSsr && !fs.existsSync(serverFileAbs())) {
                ctx.log.Warn(`[kusto-react] ssr is enabled but no server bundle was found at ${serverFileAbs()}; SSR requests will fall back to CSR. Did the production build run?`);
            }
            ctx.app.use(mountPath, express.static(assetsDirAbs()));
            ctx.log.Info(`React assets served at ${mountPath}`);
        },

        async onBuild(ctx: KustoExtensionBuildContext): Promise<void> {
            const pagesDir = path.resolve(ctx.appDir, pagesDirRel);
            const outFile = path.resolve(ctx.rootDir, outDirRel, 'client.js');
            if (!fs.existsSync(pagesDir)) {
                ctx.log.Warn(`React pages directory not found (${path.relative(ctx.rootDir, pagesDir)}); nothing to build.`);
                return;
            }
            // Build the server (SSR) bundle alongside the client bundle, in parallel. The client
            // bundle is fail-fast (a broken page must fail the build); the server bundle degrades
            // gracefully (SSR falls back to CSR) so it never blocks a CSR-only deployment.
            const serverFile = serverOutFileAbs(ctx.rootDir, outDirRel);
            const serverBuild = buildServerBundle({ pagesDir, outFile: serverFile, production: ctx.isProduction })
                .then(({ pages }) => ctx.log.Info(`React server bundle built: ${pages.length} page(s) -> ${path.relative(ctx.rootDir, serverFile)}`))
                .catch((error) => ctx.log.Warn('React server bundle build failed; SSR will fall back to CSR', { error }));
            const { pages } = await buildClientBundle({ pagesDir, outFile, production: ctx.isProduction });
            ctx.log.Info(`React client bundle built: ${pages.length} page(s) -> ${path.relative(ctx.rootDir, outFile)}`);
            await serverBuild;
            if (tailwindEnabled) {
                const cssOutFile = path.resolve(ctx.rootDir, outDirRel, 'client.css');
                try {
                    await buildCss({
                        cssEntry: path.resolve(ctx.appDir, cssEntryRel),
                        outFile: cssOutFile,
                        baseDir: pagesDir,
                        production: ctx.isProduction,
                    });
                    ctx.log.Info(`Tailwind CSS built -> ${path.relative(ctx.rootDir, cssOutFile)}`);
                } catch (error) {
                    ctx.log.Warn('Tailwind CSS build failed', { error });
                }
            }
        },
    };
}
