// To add `router.GET_REACT(...)` to IntelliSense, augment ExpressRouter in your activation file:
//   import type { ReactRouteOptions } from '@expressjs-kusto/react';
//   declare module '@lib/http/routing/expressRouter' {
//     interface ExpressRouter { GET_REACT(component: string, options?: ReactRouteOptions): this; }
//   }
// (A ready-made ambient version also ships as `@expressjs-kusto/react/augment` for tsconfigs that
//  pick up package types: `/// <reference types="@expressjs-kusto/react/augment" />`.)

export { react } from './reactExtension';
export { renderShell } from './shell';
export { discoverPages, generateEntrySource, buildClientBundle } from './bundler';

export type {
    ReactExtensionOptions,
    ReactRouteOptions,
    DiscoveredPage,
    KustoExtension,
    KustoRouterContext,
    KustoExtensionInitContext,
    KustoExtensionBuildContext,
    KustoLog,
} from './types';

export type { ShellParams } from './shell';
export type { BuildClientOptions, BuildClientResult } from './bundler';
