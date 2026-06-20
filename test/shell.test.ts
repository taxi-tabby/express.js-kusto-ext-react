import { renderShell } from '../src/shell';

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
});
