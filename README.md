# @expressjs-kusto/react

React rendering extension for the [Express.js-Kusto](https://github.com/) framework. Adds a
`router.GET_REACT('Page')` method that renders React pages, wired through the framework's
**Convention-over-Configuration extension system** — no changes to framework core.

> **v1 = CSR (client-side rendering).** `GET_REACT` serves an HTML shell that boots the named
> React page in the browser; the extension builds the client bundle and manages a
> `react-router` `BrowserRouter`. Server-side rendering (SSR) is planned — see [Roadmap](#roadmap).

## How it fits

This is a **Kusto extension**: it ships a plain `KustoExtension` object and is activated by a
one-line file under your project's `src/app/extensions/` folder. When loaded, the framework
registers `GET_REACT` on `ExpressRouter`, serves the built client assets, and (in dev) rebuilds
the bundle on boot. The new method appears in your IDE via a TypeScript declaration-merge.

## Requirements

- A project built on the Express.js-Kusto framework (with the extension system, i.e. the
  `src/app/extensions/` convention and `@lib` path alias).
- Peer dependencies installed in that project: `react`, `react-dom`, `react-router-dom`, `express`.

## Install

```bash
npm install @expressjs-kusto/react
```

`react`, `react-dom`, and `react-router-dom` are peer dependencies and are
installed automatically by npm 7+ (and modern pnpm/yarn). If your package
manager does not auto-install peers, add them explicitly:

```bash
npm install @expressjs-kusto/react react react-dom react-router-dom
```

## Setup

### 1. Activate the extension (CoC)

Create `src/app/extensions/react.ts`:

```typescript
/// <reference types="@expressjs-kusto/react/augment" />
import { react } from '@expressjs-kusto/react';

export default react();
```

The triple-slash reference pulls in the `ExpressRouter` type augmentation, so `router.GET_REACT(...)`
is recognised across your project (IntelliSense + type-checking).

### 2. Add React pages

Put page components under `src/app/views/` (configurable). Each file default-exports a component:

```tsx
// src/app/views/Home.tsx
export default function Home(props: { name?: string }) {
  return <h1>Hello {props.name ?? 'world'}</h1>;
}
```

Nested files become dotted keys: `src/app/views/admin/Dashboard.tsx` → `admin/Dashboard`.

### 3. Render pages from routes

In any `route.ts`, the Express route maps to a React page — the framework owns the routing:

```typescript
import { ExpressRouter } from '@lib/http/routing/expressRouter';

const router = new ExpressRouter();
router.GET_REACT('Home', { props: { name: 'kusto' }, title: 'Home' });
export default router.build();
```

`GET_REACT` is chainable like the other verbs and auto-registers an OpenAPI entry.

### 4. Styling with Tailwind CSS

Tailwind CSS **v4** is bundled and enabled by default — just use utility classes
in your page components:

```tsx
// src/app/views/Home.tsx
export default function Home() {
  return <h1 className="text-3xl font-bold text-indigo-600">Hello</h1>;
}
```

The extension compiles a stylesheet (scanning your components) and injects a
`<link>` into every page shell automatically. No `tailwind.config.js` is needed.

To customize (add `@theme`, custom CSS, extra `@source` paths), create
`src/app/views/app.css` — it becomes the Tailwind input:

```css
@import "tailwindcss";

@theme {
  --color-brand: #5b21b6;
}
```

Disable Tailwind with `react({ tailwind: false })`, or point at a different input
with `react({ cssEntry: 'styles/app.css' })`.

## API

### `react(options?)`

| Option | Default | Description |
|---|---|---|
| `pagesDir` | `views` | Pages directory, relative to `src/app`. |
| `mountPath` | `/__kusto_react` | URL prefix the built client assets are served under. |
| `outDir` | `.kusto/react` | Output dir (relative to project root) for built assets. |
| `title` | `Kusto React` | Default `<title>`. |
| `production` | `NODE_ENV==='production'` | Force production (minified) bundle / disable dev rebuild. |
| `tailwind` | `true` | Compile Tailwind CSS (v4) and link it into every page shell. |
| `cssEntry` | `views/app.css` | Tailwind input CSS, relative to `src/app`. Falls back to a default `@import "tailwindcss";` if the file is absent. |
| `head` | – | Extra `<head>` HTML (e.g. stylesheet links). |

### `router.GET_REACT(component, options?)`

| Option | Description |
|---|---|
| `title` | Override the page `<title>`. |
| `props` | Static object, or `(req) => props` (sync/async) for request-derived props. Serialized into the shell. |
| `summary` | OpenAPI summary for the route. |

## Building & dev

- **Dev**: the client bundle is built automatically on server boot (when not in production), so
  pages render with no extra step.
- **Production**: build the bundle ahead of serving:

  ```bash
  npx kusto extensions build --production
  ```

  This runs the extension's `onBuild` hook (esbuild) and writes `<outDir>/client.js`, which the
  framework then serves statically at `mountPath`. A failing build exits non-zero (fail-fast).

## How it works

1. `GET_REACT('Home')` registers a `GET` route that responds with an HTML shell containing
   `#root`, the page name + props (`window.__KUSTO_PAGE__` / `__KUSTO_PROPS__`), and a `<script>`
   tag for the client bundle.
2. `onBuild` (and dev-boot) discover every page under `pagesDir` and bundle them with **esbuild**
   into one browser IIFE, alongside a small runtime.
3. In the browser, the runtime reads `__KUSTO_PAGE__`, looks the component up in the bundled
   registry, and renders it inside a `react-router` `BrowserRouter`.

## Roadmap

- **SSR + hydration** (server `renderToString`/streaming).
- **SPA route table**: derive a client-side `react-router` route map from all `GET_REACT`
  registrations so cross-page navigation is client-side (today each page is its own server entry;
  in-page `react-router` is fully available).
- Per-page code splitting.

## Publishing

```bash
npm run build          # emits dist/ with .d.ts (also runs on prepublishOnly)
npm publish --access public
```

The package publishes only `dist/` (+ `README`/`LICENSE`). Requires the `@expressjs-kusto` npm
scope to exist and your account to have publish rights.

## License

MIT
