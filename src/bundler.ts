import * as fs from 'fs';
import * as path from 'path';
import type { DiscoveredPage } from './types';

const PAGE_EXTENSIONS = ['.tsx', '.jsx', '.ts', '.js'];

/** Recursively discover page component files under `pagesDir` (filename order, nested keys joined by `/`). */
export function discoverPages(pagesDir: string): DiscoveredPage[] {
    if (!fs.existsSync(pagesDir)) return [];
    const out: DiscoveredPage[] = [];

    const walk = (dir: string, prefix: string): void => {
        const entries = fs
            .readdirSync(dir, { withFileTypes: true })
            .sort((a, b) => a.name.localeCompare(b.name));
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full, prefix ? `${prefix}/${entry.name}` : entry.name);
                continue;
            }
            if (entry.name.endsWith('.d.ts')) continue;
            const ext = path.extname(entry.name);
            if (!PAGE_EXTENSIONS.includes(ext)) continue;
            const base = entry.name.slice(0, -ext.length);
            if (base.endsWith('.test') || base.endsWith('.spec')) continue;
            const key = prefix ? `${prefix}/${base}` : base;
            out.push({ key, importPath: `./${key}` });
        }
    };

    walk(pagesDir, '');
    return out;
}

/** Generate the client entry source that imports every page and mounts the one named by `window.__KUSTO_PAGE__`. */
export function generateEntrySource(pages: DiscoveredPage[]): string {
    const imports = pages.map((p, i) => `import P${i} from ${JSON.stringify(p.importPath)};`).join('\n');
    const registry = pages.map((p, i) => `  ${JSON.stringify(p.key)}: P${i},`).join('\n');
    return `import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
${imports}

var __KUSTO_REGISTRY = {
${registry}
};

function __kustoMount() {
  var w = window;
  var name = w.__KUSTO_PAGE__;
  var props = w.__KUSTO_PROPS__ || {};
  var el = document.getElementById('root');
  if (!el) return;
  var Page = name ? __KUSTO_REGISTRY[name] : undefined;
  if (!Page) {
    el.textContent = 'Kusto React: page "' + name + '" was not found in the client bundle.';
    return;
  }
  createRoot(el).render(React.createElement(BrowserRouter, null, React.createElement(Page, props)));
}

__kustoMount();
`;
}

export interface BuildClientOptions {
    /** Absolute path to the pages directory. */
    pagesDir: string;
    /** Absolute path of the bundle to write. */
    outFile: string;
    /** Production mode (minify, no sourcemap). */
    production: boolean;
}

export interface BuildClientResult {
    pages: DiscoveredPage[];
    outFile: string;
}

/** Bundle all discovered pages + the client runtime into a single browser IIFE via esbuild. */
export async function buildClientBundle(opts: BuildClientOptions): Promise<BuildClientResult> {
    const pages = discoverPages(opts.pagesDir);
    const entrySource = generateEntrySource(pages);
    fs.mkdirSync(path.dirname(opts.outFile), { recursive: true });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const esbuild = require('esbuild');
    await esbuild.build({
        stdin: {
            contents: entrySource,
            resolveDir: opts.pagesDir,
            sourcefile: '__kusto_react_entry.tsx',
            loader: 'tsx',
        },
        bundle: true,
        outfile: opts.outFile,
        platform: 'browser',
        format: 'iife',
        jsx: 'automatic',
        minify: opts.production,
        sourcemap: !opts.production,
        logLevel: 'silent',
        define: { 'process.env.NODE_ENV': JSON.stringify(opts.production ? 'production' : 'development') },
    });

    return { pages, outFile: opts.outFile };
}
