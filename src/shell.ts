/** HTML shell generation for a CSR React page. */

export interface ShellParams {
    /** Page key (e.g. `Home`) the client runtime should mount. */
    page: string;
    /** Static props passed to the page component. */
    props?: Record<string, unknown>;
    /** URL of the client bundle (e.g. `/__kusto_react/client.js`). */
    clientSrc: string;
    /** URL of the generated stylesheet (e.g. `/__kusto_react/client.css`). When set, a `<link>` is injected. */
    cssSrc?: string;
    /** Document `<title>`. */
    title: string;
    /** Extra HTML injected into `<head>`. */
    head?: string;
    /**
     * Pre-rendered page markup (from server-side `renderToString`). When set, it is
     * injected verbatim into `#root` and the client runtime hydrates instead of
     * doing a fresh client render. When absent, `#root` is empty (CSR).
     */
    ssrHtml?: string;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Reduce props to the exact value the client will hydrate from. The client reads
 * `window.__KUSTO_PROPS__`, which is `JSON.stringify(props)` (see {@link renderShell}),
 * so for SSR the server must render from the same JSON-round-tripped value. Otherwise
 * values that don't survive a JSON round-trip (Date, `undefined`, NaN/Infinity, Map/Set,
 * functions) diverge between server render and client hydration, causing hydration
 * mismatches. Non-serializable input (e.g. BigInt) is returned unchanged so the shell's
 * own serialization surfaces the same error it always has (no SSR-specific regression).
 */
export function toSerializableProps(props: Record<string, unknown>): Record<string, unknown> {
    try {
        return JSON.parse(JSON.stringify(props ?? {}));
    } catch {
        return props ?? {};
    }
}

/** Serialize JSON safely for inlining inside a `<script>` (prevents `</script>` / HTML-comment breakout). */
function jsonForScript(value: unknown): string {
    return JSON.stringify(value ?? null)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026');
}

/** Render the HTML shell that boots a React page on the client. */
export function renderShell(params: ShellParams): string {
    const pageJson = jsonForScript(params.page);
    const propsJson = jsonForScript(params.props ?? {});
    const styleLink = params.cssSrc ? `<link rel="stylesheet" href="${escapeHtml(params.cssSrc)}" />\n` : '';
    // ssrHtml is already valid HTML produced by renderToString — inject it verbatim
    // (escaping it would corrupt the markup and break hydration).
    const rootContent = params.ssrHtml ?? '';
    const ssrFlag = params.ssrHtml ? 'true' : 'false';
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(params.title)}</title>
${styleLink}${params.head ?? ''}
</head>
<body>
<div id="root">${rootContent}</div>
<script>window.__KUSTO_PAGE__=${pageJson};window.__KUSTO_PROPS__=${propsJson};window.__KUSTO_SSR__=${ssrFlag};</script>
<script src="${escapeHtml(params.clientSrc)}" defer></script>
</body>
</html>`;
}
