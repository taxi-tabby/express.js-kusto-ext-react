import * as fs from 'fs';
import * as path from 'path';
import { discoverPages } from './bundler';
import type { DiscoveredPage } from './types';

/**
 * React (and react-dom/react-router) must come from the host project at runtime, not be
 * bundled into the server module — a second copy would create two React instances
 * ("invalid hook call" / context mismatch). The subpath runtimes (`react/jsx-runtime`)
 * are externalized too because esbuild's automatic JSX runtime imports them.
 */
const SSR_EXTERNALS = [
    'react',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
    'react-dom',
    'react-dom/server',
    'react-router-dom',
    'react-router-dom/server',
];

/**
 * Generate the server entry source that imports every page and exports
 * `renderPage(name, props, url)` — the server-side counterpart of the client runtime.
 * It renders the named page to an HTML string inside a `react-router` `StaticRouter`.
 */
export function generateServerEntrySource(pages: DiscoveredPage[]): string {
    const imports = pages.map((p, i) => `import P${i} from ${JSON.stringify(p.importPath)};`).join('\n');
    const registry = pages.map((p, i) => `  ${JSON.stringify(p.key)}: P${i},`).join('\n');
    return `import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
${imports}

var __KUSTO_REGISTRY = {
${registry}
};

export function renderPage(name, props, url) {
  var Page = __KUSTO_REGISTRY[name];
  if (!Page) {
    throw new Error('Kusto React: page "' + name + '" was not found in the server bundle.');
  }
  return renderToString(
    React.createElement(StaticRouter, { location: url || '/' }, React.createElement(Page, props || {}))
  );
}
`;
}

export interface BuildServerOptions {
    /** Absolute path to the pages directory. */
    pagesDir: string;
    /** Absolute path of the server module to write (use a `.cjs` extension so it is always requirable). */
    outFile: string;
    /** Production mode (sets NODE_ENV for the bundled code). */
    production: boolean;
}

export interface BuildServerResult {
    pages: DiscoveredPage[];
    outFile: string;
}

/** A function that renders a page to an HTML string. Shape of the server bundle's `renderPage` export. */
export type RenderPage = (name: string, props: Record<string, unknown>, url: string) => string;

/** Bundle all discovered pages + the SSR runtime into a single Node CJS module via esbuild. */
export async function buildServerBundle(opts: BuildServerOptions): Promise<BuildServerResult> {
    const pages = discoverPages(opts.pagesDir);
    const entrySource = generateServerEntrySource(pages);
    fs.mkdirSync(path.dirname(opts.outFile), { recursive: true });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const esbuild = require('esbuild');
    await esbuild.build({
        stdin: {
            contents: entrySource,
            resolveDir: opts.pagesDir,
            sourcefile: '__kusto_react_server_entry.tsx',
            loader: 'tsx',
        },
        bundle: true,
        outfile: opts.outFile,
        platform: 'node',
        format: 'cjs',
        jsx: 'automatic',
        minify: false,
        sourcemap: false,
        logLevel: 'silent',
        external: SSR_EXTERNALS,
        define: { 'process.env.NODE_ENV': JSON.stringify(opts.production ? 'production' : 'development') },
    });

    return { pages, outFile: opts.outFile };
}
