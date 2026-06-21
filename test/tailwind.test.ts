import * as fs from 'fs';
import * as path from 'path';
import { buildCss } from '../src/tailwind';

const FIXTURES = path.join(__dirname, 'fixtures', 'tailwind');
const TMP = path.join(__dirname, '.tmp-css');

describe('buildCss', () => {
    afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

    it('generates utilities used by components under baseDir from the default input', async () => {
        const outFile = path.join(TMP, 'client.css');
        const { outFile: written } = await buildCss({
            cssEntry: path.join(FIXTURES, 'does-not-exist.css'),
            outFile,
            baseDir: FIXTURES,
            production: false,
        });
        expect(fs.existsSync(written)).toBe(true);
        const css = fs.readFileSync(written, 'utf-8');
        // `font-bold` is used in Card.tsx, so its utility must be generated.
        expect(css).toContain('font-bold');
        expect(css).toContain('font-weight');
    });

    it('uses a user-provided cssEntry when it exists', async () => {
        const entry = path.join(TMP, 'app.css');
        fs.mkdirSync(TMP, { recursive: true });
        fs.writeFileSync(entry, '@import "tailwindcss";\n.brand{color:rebeccapurple}\n');
        const outFile = path.join(TMP, 'client2.css');
        await buildCss({ cssEntry: entry, outFile, baseDir: FIXTURES, production: false });
        const css = fs.readFileSync(outFile, 'utf-8');
        expect(css).toContain('rebeccapurple');
        expect(css).toContain('font-bold');
    });
});
