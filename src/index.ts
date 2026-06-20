// The ExpressRouter type augmentation (adds `router.GET_REACT(...)` to IntelliSense) ships as
// `@expressjs-kusto/react/augment`. Enable it in your activation file with:
//   /// <reference types="@expressjs-kusto/react/augment" />
// (It is a separate ambient declaration file so it merges into the host's `@lib` ExpressRouter.)

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
