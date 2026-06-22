import type { Express, Router, RequestHandler } from 'express';

/**
 * Minimal structural mirror of the Express.js-Kusto core extension contract
 * (`@lib/extensions/extensionTypes`). The core validates extensions *structurally*
 * at load time, so this package depends only on these shapes — not on the core
 * package — which keeps it independently buildable and publishable. These must stay
 * structurally compatible with the core's contract.
 */

/** Stable router context an extension router method receives (mirror of core `RouterContext`). */
export interface KustoRouterContext {
    router: Router;
    basePath: string;
    wrapHandler(handler: (...args: any[]) => any, serialize?: any): RequestHandler;
    wrapMiddleware(handler: (...args: any[]) => any): RequestHandler;
    registerDocumentation(method: string, path: string, config: any): void;
    [key: string]: any;
}

/** Minimal logger surface (mirror of the core `log`). */
export interface KustoLog {
    Info(message: string, meta?: any): void;
    Warn(message: string, meta?: any): void;
    Error(message: string, meta?: any): void;
    Debug?(message: string, meta?: any): void;
    [level: string]: any;
}

/** Context for `onInit` (mirror of core `ExtensionInitContext`). */
export interface KustoExtensionInitContext {
    app: Express;
    config: Record<string, any>;
    registerMiddleware(mw: RequestHandler): void;
    log: KustoLog;
}

/** Context for `onBuild` (mirror of core `ExtensionBuildContext`). */
export interface KustoExtensionBuildContext {
    rootDir: string;
    appDir: string;
    isProduction: boolean;
    log: KustoLog;
}

/** A Kusto extension object (mirror of core `KustoExtension`). */
export interface KustoExtension {
    name: string;
    version?: string;
    routerMethods?: Record<string, (ctx: KustoRouterContext, ...args: any[]) => void>;
    onInit?(ctx: KustoExtensionInitContext): void | Promise<void>;
    onBuild?(ctx: KustoExtensionBuildContext): void | Promise<void>;
}

/** Options for the React extension factory `react(options)`. */
export interface ReactExtensionOptions {
    /** Directory (relative to the app workspace `src/app`) holding React page components. Default: `views`. */
    pagesDir?: string;
    /** URL prefix the built client assets are served under. Default: `/__kusto_react`. */
    mountPath?: string;
    /** Output directory (relative to project root) for built client assets. Default: `.kusto/react`. */
    outDir?: string;
    /** Default `<title>` for rendered pages. Default: `Kusto React`. */
    title?: string;
    /** Force production mode (minified bundle, no dev rebuild). Default: derived from `NODE_ENV`. */
    production?: boolean;
    /** Compile Tailwind CSS (v4) and link it into every shell. Default: `true`. */
    tailwind?: boolean;
    /** Tailwind input CSS path (relative to `src/app`). If absent, a default `@import "tailwindcss";` is used. Default: `views/app.css`. */
    cssEntry?: string;
    /** Extra `<head>` HTML injected into every shell (e.g. stylesheet links). */
    head?: string;
    /**
     * Default rendering mode for all pages. When `true`, pages are server-rendered
     * (`renderToString`) and hydrated on the client; when `false`, pages are
     * client-rendered (CSR). Override per route with `GET_REACT(..., { ssr })`.
     * Default: `false` (CSR). SSR falls back to CSR if a page cannot be rendered
     * on the server.
     */
    ssr?: boolean;
}

/** Per-route options for `router.GET_REACT(component, options)`. */
export interface ReactRouteOptions {
    /** Override the page `<title>`. */
    title?: string;
    /**
     * Static props serialized into the shell and passed to the page component.
     * For request-derived props, pass a function `(req) => props`.
     */
    props?: Record<string, unknown> | ((req: any) => Record<string, unknown> | Promise<Record<string, unknown>>);
    /** OpenAPI summary for this route (passed through to the docs system). */
    summary?: string;
    /**
     * Override the rendering mode for this route. `true` server-renders + hydrates,
     * `false` forces CSR. Defaults to the extension-level `ssr` option.
     */
    ssr?: boolean;
}

/** A discovered React page (file under the pages directory). */
export interface DiscoveredPage {
    /** Page key, e.g. `Home` or `admin/Dashboard` (used by `GET_REACT('Home')`). */
    key: string;
    /** Import specifier relative to the pages directory, e.g. `./Home`. */
    importPath: string;
}
