import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_INPUT = '@import "tailwindcss";\n';

export interface BuildCssOptions {
    /** Absolute path to the input CSS. If it does not exist, a default `@import "tailwindcss";` is used. */
    cssEntry: string;
    /** Absolute path of the CSS file to write. */
    outFile: string;
    /** Directory Tailwind scans for class usage. */
    baseDir: string;
    /** Production mode (minify the output). */
    production: boolean;
}

export interface BuildCssResult {
    outFile: string;
}

/** Compile Tailwind CSS (v4) for the discovered pages and write the result to `outFile`. */
export async function buildCss(opts: BuildCssOptions): Promise<BuildCssResult> {
    const hasEntry = fs.existsSync(opts.cssEntry);
    const input = hasEntry ? fs.readFileSync(opts.cssEntry, 'utf-8') : DEFAULT_INPUT;
    const from = hasEntry ? opts.cssEntry : path.join(opts.baseDir, '__kusto_tailwind.css');

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const postcss = require('postcss');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const tailwind = require('@tailwindcss/postcss');

    const result = await postcss([tailwind({ base: opts.baseDir, optimize: opts.production })]).process(input, { from });

    fs.mkdirSync(path.dirname(opts.outFile), { recursive: true });
    fs.writeFileSync(opts.outFile, result.css, 'utf-8');
    return { outFile: opts.outFile };
}
