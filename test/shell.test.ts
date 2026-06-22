import { renderShell, toSerializableProps } from '../src/shell';

describe('renderShell', () => {
    it('embeds the page name, props, title, and client script', () => {
        const html = renderShell({
            page: 'Home',
            props: { name: 'kusto' },
            clientSrc: '/__kusto_react/client.js',
            title: 'My App',
        });
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('<title>My App</title>');
        expect(html).toContain('window.__KUSTO_PAGE__="Home"');
        expect(html).toContain('"name":"kusto"');
        expect(html).toContain('<script src="/__kusto_react/client.js" defer></script>');
        expect(html).toContain('<div id="root"></div>');
    });

    it('injects a stylesheet link when cssSrc is set, before the user head', () => {
        const html = renderShell({
            page: 'Home',
            clientSrc: '/__kusto_react/client.js',
            title: 'T',
            cssSrc: '/__kusto_react/client.css',
            head: '<meta name="custom" />',
        });
        const link = '<link rel="stylesheet" href="/__kusto_react/client.css" />';
        expect(html).toContain(link);
        // stylesheet must come before the user-provided head so head can override
        expect(html.indexOf(link)).toBeLessThan(html.indexOf('<meta name="custom" />'));
    });

    it('omits the stylesheet link when cssSrc is not set', () => {
        const html = renderShell({ page: 'Home', clientSrc: '/c.js', title: 'T' });
        expect(html).not.toContain('rel="stylesheet"');
    });

    it('escapes the cssSrc href (no attribute injection)', () => {
        const html = renderShell({ page: 'X', clientSrc: '/c.js', title: 'T', cssSrc: '"/><script>x</script>' });
        expect(html).not.toContain('<script>x</script>');
        expect(html).toContain('&quot;');
    });

    it('escapes the title (no raw HTML injection)', () => {
        const html = renderShell({ page: 'X', clientSrc: '/c.js', title: '<script>alert(1)</script>' });
        expect(html).not.toContain('<title><script>alert(1)</script></title>');
        expect(html).toContain('&lt;script&gt;');
    });

    it('escapes < > & inside inlined JSON to prevent </script> breakout', () => {
        const html = renderShell({ page: 'X', props: { html: '</script><b>' }, clientSrc: '/c.js', title: 'T' });
        expect(html).not.toContain('</script><b>');
        expect(html).toContain('\\u003c');
    });

    it('leaves #root empty and sets __KUSTO_SSR__=false when ssrHtml is absent (CSR)', () => {
        const html = renderShell({ page: 'Home', clientSrc: '/c.js', title: 'T' });
        expect(html).toContain('<div id="root"></div>');
        expect(html).toContain('window.__KUSTO_SSR__=false');
    });

    it('injects pre-rendered markup into #root and sets __KUSTO_SSR__=true when ssrHtml is set (SSR)', () => {
        const html = renderShell({
            page: 'Home',
            props: { name: 'kusto' },
            clientSrc: '/c.js',
            title: 'T',
            ssrHtml: '<div class="home">Hello kusto</div>',
        });
        expect(html).toContain('<div id="root"><div class="home">Hello kusto</div></div>');
        expect(html).toContain('window.__KUSTO_SSR__=true');
        // The client bundle still loads so the markup can hydrate.
        expect(html).toContain('<script src="/c.js" defer></script>');
    });

    it('does not escape ssrHtml (it is already valid HTML from renderToString)', () => {
        const html = renderShell({ page: 'X', clientSrc: '/c.js', title: 'T', ssrHtml: '<span>a&b</span>' });
        expect(html).toContain('<div id="root"><span>a&b</span></div>');
    });
});

describe('toSerializableProps', () => {
    it('round-trips props through JSON so the server renders from the same data the client hydrates from', () => {
        const out = toSerializableProps({ when: new Date(0), n: 1, s: 'x' });
        // Date is not JSON-round-trip-safe; the client receives the ISO string, so the server must too.
        expect(out.when).toBe('1970-01-01T00:00:00.000Z');
        expect(out.n).toBe(1);
        expect(out.s).toBe('x');
    });

    it('drops undefined keys (matching JSON.stringify behavior)', () => {
        expect(toSerializableProps({ a: undefined, b: 2 })).toEqual({ b: 2 });
    });

    it('returns the original object unchanged when props are not JSON-serializable', () => {
        const notSerializable = { v: BigInt(1) } as unknown as Record<string, unknown>;
        expect(toSerializableProps(notSerializable)).toBe(notSerializable);
    });
});
