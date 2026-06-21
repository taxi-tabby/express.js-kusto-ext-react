# Tailwind CSS v4 Integration — Design

Date: 2026-06-21

## Goal

Ship Tailwind CSS v4 alongside the React extension so that, after
`npm install @expressjs-kusto/react`, page components can use Tailwind utility
classes with no extra setup. Tailwind is enabled by default.

## Background

Current build flow (`src/reactExtension.ts`):

- esbuild bundles all discovered pages into `client.js` (IIFE) → written to `outDir`.
- `outDir` is served statically at `mountPath`.
- `renderShell` emits an HTML shell that links `client.js` and an optional `head`.

Tailwind v4 is CSS-first: no `tailwind.config.js` required. An input file with
`@import "tailwindcss";` plus the `@tailwindcss/postcss` plugin generates CSS by
auto-scanning source files for class usage.

## Design

### Dependencies (regular `dependencies`, build-time only)

- `tailwindcss@^4`
- `@tailwindcss/postcss@^4`
- `postcss@^8`

These run server-side during build; only the generated `client.css` reaches the browser.

### Options (`ReactExtensionOptions`)

- `tailwind?: boolean` — default `true`.
- `cssEntry?: string` — input CSS path relative to `src/app`. Default `views/app.css`.

### New module `src/tailwind.ts`

`buildCss({ cssEntry, outFile, baseDir, production }): Promise<{ outFile }>`

1. If `cssEntry` exists on disk, use its contents as input; otherwise use the
   default input `@import "tailwindcss";`.
2. Process with `postcss([tailwindcss()])`, setting `from` to a path inside the
   views directory so Tailwind's auto content-detection scans page components.
3. Write the result to `outFile` (`client.css` in `outDir`). On failure, the
   caller logs a warning and continues (same graceful behavior as the JS bundle).

### Build wiring (`src/reactExtension.ts`)

- When `tailwind` is enabled, call `buildCss` next to `buildClientBundle` in both
  `onInit` (dev boot) and `onBuild`.
- `client.css` is exposed automatically at `${mountPath}/client.css` because
  `outDir` is already served statically.

### Shell injection (`src/shell.ts`)

- Add `cssSrc?: string` to `ShellParams`. When present, inject
  `<link rel="stylesheet" href="...">` into `<head>` **before** the user `head`
  so user-provided head markup can override.

## Testing

- `test/tailwind.test.ts`: given an input CSS and a fixture component using a
  utility class, `buildCss` produces an output file containing the generated
  utility.
- `test/shell.test.ts`: `renderShell` includes the stylesheet link when `cssSrc`
  is set and omits it otherwise.

## Out of scope

- The stale hardcoded `version: '0.1.0'` in `reactExtension.ts` (tracked separately).
