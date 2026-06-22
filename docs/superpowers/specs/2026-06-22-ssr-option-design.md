# SSR Option — Design

Date: 2026-06-22

## Goal

Add **server-side rendering (full SSR + hydration)** as an opt-in option to the
React extension. CSR remains the default; nothing changes for existing projects
that don't set the option. SSR must be performant and stable, and degrade
gracefully (fall back to CSR) when a page cannot be server-rendered.

## Decisions (from brainstorming)

1. **Flavor:** Full SSR + hydration. Server emits complete HTML via
   `renderToString`; the client `hydrateRoot`s to attach interactivity.
2. **Granularity:** Global default + per-route override. `react({ ssr: true })`
   sets the default; `GET_REACT('Home', { ssr: false })` overrides per route.
   Global default is `false` → **existing CSR behavior is unchanged**.
3. **Server module strategy:** A separate esbuild **server bundle** (Node/CJS),
   mirroring the existing client bundle. React and friends are `external`.
4. **Failure behavior:** Graceful **CSR fallback** with a warning (consistent
   with the library's existing graceful-degradation pattern).

## Background — current CSR flow

- `discoverPages()` (`src/bundler.ts`) walks `pagesDir` → `{ key, importPath }[]`.
- `generateEntrySource()` emits a browser entry that imports all pages, builds a
  registry, reads `window.__KUSTO_PAGE__`, and `createRoot(...).render(<BrowserRouter><Page/></BrowserRouter>)`.
- `buildClientBundle()` esbuilds that into one IIFE `client.js` (React bundled in).
- `renderShell()` (`src/shell.ts`) emits an HTML shell with an empty `#root`, the
  serialized page name + props, an optional CSS `<link>`, and `<script src=client.js defer>`.
- `react()` (`src/reactExtension.ts`) registers `GET_REACT`, builds the client
  bundle (dev boot + `onBuild`), and serves `outDir` statically at `mountPath`.

## Design

### API surface (`src/types.ts`)

- `ReactExtensionOptions.ssr?: boolean` — global default. Default `false`.
- `ReactRouteOptions.ssr?: boolean` — per-route override.
- Effective per route: `routeOptions?.ssr ?? globalSsr`.

No new dependencies: `react-dom/server` (`renderToString`) and
`react-router-dom/server` (`StaticRouter`) ship inside the existing peer deps.

### New module `src/serverBundle.ts` (mirror of `bundler.ts`)

- `generateServerEntrySource(pages)`: emits a Node entry importing every page,
  building the same registry, and **exporting** `renderPage(name, props, url)`:

  ```
  renderToString(
    React.createElement(StaticRouter, { location: url },
      React.createElement(Page, props)))
  ```

  Unknown page name → throws (caller catches → CSR fallback).

- `buildServerBundle(opts)`: esbuild with
  - `platform: 'node'`, `format: 'cjs'`, output extension **`.cjs`** (safe to
    `require()` even when the host project's `package.json` is `"type":"module"`),
  - `external: ['react','react-dom','react-dom/server','react-router-dom','react-router-dom/server']`
    so the host's installed React is used (single React instance — avoids the
    "two Reacts"/invalid-hook-call class of bugs), and the server bundle stays small,
  - no minify (server-side), `bundle: true`, same `jsx: 'automatic'` + `define`.

- **Output location:** a directory **not** under the static mount. The client
  assets live in `outDir` which is served by `express.static`; the server bundle
  is written to a sibling (default `<outDir>-server/server.cjs`) so server code is
  never reachable at a public URL.

### Client runtime (`src/bundler.ts` → `generateEntrySource`)

- Import `createRoot` **and** `hydrateRoot` from `react-dom/client`.
- Branch on the SSR flag:

  ```
  var element = React.createElement(BrowserRouter, null, React.createElement(Page, props));
  if (window.__KUSTO_SSR__) hydrateRoot(rootEl, element);
  else createRoot(rootEl).render(element);
  ```

- Server uses `StaticRouter(location=url)`, client uses `BrowserRouter`; same URL
  + same props → identical initial markup → hydration matches.

### HTML shell (`src/shell.ts` → `renderShell`)

- Add `ShellParams.ssrHtml?: string`.
- `<div id="root">${ssrHtml ?? ''}</div>` — inject pre-rendered markup verbatim
  (already valid HTML from `renderToString`; do **not** escape it).
- Emit `window.__KUSTO_SSR__=${ssrHtml ? 'true' : 'false'};` next to page/props.
- `client.js` still loads (needed for hydration / interactivity).

### Extension wiring (`src/reactExtension.ts`)

- Resolve `globalSsr = options.ssr ?? false`.
- Factory-closure cache: `let serverRender: ((name, props, url) => string) | null = null`.
- **Build:** build the server bundle alongside the client bundle in both `onInit`
  (dev boot) and `onBuild`. Run the two esbuild passes **in parallel**
  (`Promise.all`) to keep boot fast. Build failures warn and continue (same as the
  client bundle) → `serverRender` stays `null` → SSR requests fall back to CSR.
- **Load (LAZY — refined after code review):** the server bundle is `require()`d
  lazily by `getServerRender()` on the **first request that actually needs SSR**,
  then cached. `onInit` does **not** eagerly `require()` it. This preserves the
  CSR-only guarantee: a project that never uses SSR never executes page-component
  code on the Node side at boot (require'ing the bundle runs every page module's
  top-level code — e.g. a top-level `window`/`document` access would throw in Node).
- **Diagnostics:** when `globalSsr` is `true` but no server bundle exists at boot,
  `onInit` emits one warning so a misconfigured production deploy is observable.
- **Render (`GET_REACT` handler):**

  ```
  effectiveSsr = routeOptions?.ssr ?? globalSsr
  let ssrHtml
  if (effectiveSsr) {
    const render = getServerRender()           // lazy require, cached
    if (render) {
      try {
        const renderProps = toSerializableProps(props)   // hydration parity (see below)
        ssrHtml = render(component, renderProps, req.originalUrl ?? '/')
      } catch (e) { log.Warn('[kusto-react] SSR render failed; falling back to CSR', {error:e}) }
    }
  }
  res.status(200).type('html').send(renderShell({ ..., ssrHtml }))
  ```

- **Hydration parity (refined after code review):** the client hydrates from
  `window.__KUSTO_PROPS__` = `JSON.stringify(props)`, so the server must render from
  the same JSON-round-tripped value (`toSerializableProps`). Otherwise values that
  don't survive a JSON round-trip (Date, `undefined`, NaN/Infinity, Map/Set,
  functions) diverge between server render and client hydration → hydration mismatch.
- Trade-off: the server bundle still *builds* even for pure-CSR projects (one extra,
  parallel esbuild pass — tens of ms for small apps; building does not execute page
  code). Chosen for predictability so per-route opt-in works with zero extra config.
  A future build-gate is out of scope.

### Backward compatibility

- Default `ssr=false`: handler never calls `getServerRender()` (so the server bundle
  is never require'd, no page code runs in Node); shell renders an empty `#root` with
  `__KUSTO_SSR__=false`; client `createRoot`s — **behaviorally identical to today**.
  The new `__KUSTO_SSR__=false` line is inert. Existing tests stay green.

### Error handling / fallback

- Server bundle build failure → warn, `serverRender` stays `null` → SSR requests CSR.
- `require()` failure (corrupt/incompatible bundle) → warn, `null` → CSR.
- Per-request render throw (e.g. `window` access, unknown page) → warn → CSR for
  that request only.

## Testing

- `test/serverBundle.test.ts` (new):
  - `generateServerEntrySource` imports pages, builds registry, exports `renderPage`,
    uses `StaticRouter` + `renderToString`.
  - `buildServerBundle` (esbuild smoke) → `require()` the `.cjs` →
    `renderPage('Home', { name: 'x' }, '/')` returns markup containing `x`;
    unknown page throws.
- `test/bundler.test.ts` (extend): entry source contains both `hydrateRoot` and
  `createRoot` and branches on `__KUSTO_SSR__`.
- `test/shell.test.ts` (extend): `ssrHtml` injected into `#root` with
  `__KUSTO_SSR__=true`; absent → empty root + `false`; `toSerializableProps`
  round-trips/drops/falls-back correctly.
- `test/reactExtension.test.ts` (extend): effective ssr resolution (route overrides
  global); SSR success → non-empty root; `serverRender` throw → CSR fallback + warn;
  default (no ssr) path unchanged.

### Review-driven coverage (added after the multi-agent code review)

- **Lazy load / backward compat:** with a deliberately-broken server bundle on disk,
  `onInit` does not require it; a CSR route never triggers a load; a per-route
  `ssr:true` request loads it and falls back to CSR with a warning when require throws.
- **Diagnostics:** `onInit` warns when `ssr` is globally enabled but no bundle exists.
- **Build failure:** `buildServerBundle` rejection → `onInit` resolves (no crash) + warns.
- **Production chain:** `onBuild` writes the server bundle to the sibling dir; a fresh
  `production:true` instance loads it from disk and server-renders — proving the
  `onBuild` write path and the `onInit` read path resolve to the same file.

## Out of scope (non-goals)

- Streaming SSR (`renderToPipeableStream`).
- In-component async data fetching / Suspense data (async `props` already covers
  server-side data fetching before render).
- SPA client route table for cross-page client navigation (separate roadmap item).
- Per-page code splitting.
- A gate to skip building the server bundle for pure-CSR projects.
