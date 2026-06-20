/** HTML shell generation for a CSR React page. */

export interface ShellParams {
    /** Page key (e.g. `Home`) the client runtime should mount. */
    page: string;
    /** Static props passed to the page component. */
    props?: Record<string, unknown>;
    /** URL of the client bundle (e.g. `/__kusto_react/client.js`). */
    clientSrc: string;
    /** Document `<title>`. */
    title: string;
    /** Extra HTML injected into `<head>`. */
    head?: string;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
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
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(params.title)}</title>
${params.head ?? ''}
</head>
<body>
<div id="root"></div>
<script>window.__KUSTO_PAGE__=${pageJson};window.__KUSTO_PROPS__=${propsJson};</script>
<script src="${escapeHtml(params.clientSrc)}" defer></script>
</body>
</html>`;
}
