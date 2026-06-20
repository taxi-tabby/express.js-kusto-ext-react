/**
 * TypeScript declaration merging into the framework's ExpressRouter.
 *
 * The Express.js-Kusto framework is copied into each project under `src/core`, so the
 * router class is always reachable at the `@lib/http/routing/expressRouter` alias. This
 * file is intentionally a *script* (no top-level import/export) so the `declare module`
 * below is an ambient declaration — it compiles in this package's isolated build (where
 * `@lib` does not resolve) yet still MERGES into the real ExpressRouter in any host
 * project, where `@lib/http/routing/expressRouter` does resolve.
 *
 * Enable it in your activation file (`src/app/extensions/react.ts`):
 *   /// <reference types="@expressjs-kusto/react/augment" />
 */
declare module '@lib/http/routing/expressRouter' {
    interface ExpressRouter {
        /**
         * Render the named React page (CSR) at this route. `component` is a page file under
         * the configured pages directory (default `src/app/views`), e.g. `GET_REACT('Home')`.
         */
        GET_REACT(component: string, options?: import('./types').ReactRouteOptions): this;
    }
}
