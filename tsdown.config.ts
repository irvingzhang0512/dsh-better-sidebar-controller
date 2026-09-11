/**
 * tsdown build for dsh-better-sidebar-controller.
 *
 * The host half (lib/index.js and friends) is compiled by `tsc` (see
 * tsconfig.json); this config only produces the browser client bundle
 * (lib/client.js) in the official DSH client-bundle shape: a
 * `window.__ModuleLoader__.load({ id, factory })` closure registered with the
 * package name as id (the client-modules compose keys on the package name —
 * keep it in sync with package.json `name` and cordis.patch.yml `name`).
 *
 * The client half imports NOTHING at runtime (only erased type imports and
 * browser globals), so the bundle has no externals and no inline-safe
 * exceptions; the purity gate below still guards against a future
 * accidental @deepseek-ai value import or Node builtin leaking in.
 */
import { builtinModules } from 'node:module'
import type { UserConfig } from 'tsdown'

/** Node builtins must never survive into the browser module-loader factory. */
const NODE_BUILTINS = new Set([
  ...builtinModules,
  ...builtinModules.map(id => `node:${id}`),
])

/** The registered bundle id: the npm package name (module-loader compose key). */
const BUNDLE_ID = 'dsh-better-sidebar-controller'

/** Reject @deepseek-ai value imports: cross-plugin collaboration goes through
 *  cordis services, never value imports (type-only imports are erased and
 *  never reach this gate). */
function purityGate(): NonNullable<UserConfig['plugins']> {
  return [
    {
      name: 'dsh-better-sidebar-controller:client-purity',
      resolveId(source: string) {
        if (NODE_BUILTINS.has(source)) {
          throw new Error(
            `client bundle purity: Node builtin "${source}" cannot run in the browser module table`,
          )
        }
        if (source.startsWith('@deepseek-ai/')) {
          throw new Error(
            `client bundle purity: "${source}" is not a platform module — ` +
            'cross-plugin value imports are forbidden; collaborate through cordis services',
          )
        }
        return null
      },
    },
  ]
}

export default {
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  clean: false,
  deps: {
    // The client bundle is a self-contained browser script: its only imports
    // are the plugin's own source modules (always part of the entry graph);
    // nothing from node_modules may leak into the module-loader closure.
    neverBundle: true,
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  plugins: purityGate(),
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(BUNDLE_ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
    // The CJS wrapper factory's require only resolves module-table entries;
    // disable code splitting so the artifact is one script.
    codeSplitting: false,
  },
} satisfies UserConfig
