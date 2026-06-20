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
} from './types';
import { renderShell } from './shell';
import { buildClientBundle } from './bundler';

const DEFAULTS = {
    pagesDir: 'react/pages',
    mountPath: '/__kusto_react',
    outDir: '.kusto/react',
    title: 'Kusto React',
};

/** Normalize a mount path to a leading slash and no trailing slash. */
function normalizeMount(mount: string): string {
    let s = mount.startsWith('/') ? mount : `/${mount}`;
    if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
    return s;
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
    const clientUrl = `${mountPath}/client.js`;

    const isProduction = (): boolean => options.production ?? process.env.NODE_ENV === 'production';
    const appDirAbs = (): string => path.resolve(process.cwd(), 'src', 'app');
    const pagesDirAbs = (): string => path.resolve(appDirAbs(), pagesDirRel);
    const outFileAbs = (): string => path.resolve(process.cwd(), outDirRel, 'client.js');
    const assetsDirAbs = (): string => path.resolve(process.cwd(), outDirRel);

    return {
        name: '@expressjs-kusto/react',
        version: '0.1.0',

        routerMethods: {
            GET_REACT(ctx: KustoRouterContext, component: string, routeOptions?: ReactRouteOptions): void {
                if (!component || typeof component !== 'string') {
                    throw new Error('[kusto-react] GET_REACT requires a page component name, e.g. GET_REACT("Home").');
                }
                const serveShell = async (req: Request, res: Response): Promise<void> => {
                    const props = typeof routeOptions?.props === 'function'
                        ? await routeOptions.props(req)
                        : (routeOptions?.props ?? {});
                    res.status(200).type('html').send(renderShell({
                        page: component,
                        props,
                        clientSrc: clientUrl,
                        title: routeOptions?.title ?? defaultTitle,
                        head,
                    }));
                };
                ctx.router.get('/', (req: Request, res: Response, next: NextFunction) => {
                    serveShell(req, res).catch(next);
                });
                ctx.registerDocumentation('GET', '/', {
                    summary: routeOptions?.summary ?? `React page: ${component}`,
                    responses: { 200: { description: 'HTML shell that boots the React page on the client' } },
                });
            },
        },

        async onInit(ctx: KustoExtensionInitContext): Promise<void> {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const express = require('express');
            // In dev, build the client bundle on boot so pages render without a separate build step.
            if (!isProduction()) {
                try {
                    const { pages } = await buildClientBundle({
                        pagesDir: pagesDirAbs(),
                        outFile: outFileAbs(),
                        production: false,
                    });
                    ctx.log.Info(`React client bundle built for dev: ${pages.length} page(s)`);
                } catch (error) {
                    ctx.log.Warn('React client bundle build failed on boot; pages may not render', { error });
                }
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
            const { pages } = await buildClientBundle({ pagesDir, outFile, production: ctx.isProduction });
            ctx.log.Info(`React client bundle built: ${pages.length} page(s) -> ${path.relative(ctx.rootDir, outFile)}`);
        },
    };
}
