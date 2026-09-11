/**
 * Structural service faces for the host half, modeled on
 * dsh-better-sidebar's context-types.ts: the type base is the vendored
 * `@deepseek-ai/cordis` Context; the members this plugin touches are
 * restated as structural mirrors and combined by INTERSECTION. Intersection
 * (not `declare module` augmentation) is deliberate — DSH's own packages
 * already augment the cordis Context, and a re-declaration would fail
 * interface merging (TS2717).
 *
 * This file must stay free of browser types: it is part of the shared
 * declaration graph (tools and index import it).
 */
import type { Context as CordisContext } from '@deepseek-ai/cordis'
import type { SkillRegistration } from '@deepseek-ai/dsh-skill'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

/** The upgrade socket face (structural subset: the destroy the fence uses). */
export interface UpgradeSocket {
  destroy(): void
}

/** The upgrade head bytes (Buffer at runtime; typed as bytes so no Node global leaks). */
export type UpgradeHead = Uint8Array

/** One exact-path HTTP upgrade registration (mirror of WebUpgradeRoute). */
export interface UpgradeRoute {
  path: string
  handler: (req: unknown, socket: UpgradeSocket, head: UpgradeHead) => void | Promise<void>
}

/** The webServer service face this plugin uses. */
export interface WebServer {
  registerUpgrade(route: UpgradeRoute): () => void
}

/** A published session row (the session store's authoritative cwd lives here). */
export interface SessionHeader {
  cwd?: string
}

/** The sessions service face this plugin uses. */
export interface Sessions {
  get(sessionId: string): { header?: SessionHeader } | undefined
}

/** The web runtime face this plugin uses (trusted hosts for the fence). */
export interface WebRuntime {
  trustedHosts: readonly string[]
}

/** The tools service face (dsh-tools already augments Context; kept here for
 *  call sites that do not import the augmentation). */
export interface Tools {
  register(tool: ToolDefinition): () => void
}

/** The skills service face (the dsh-skill runtime registry). Optional: an
 *  older runtime without the registry simply skips skill self-registration. */
export interface Skills {
  register(skill: SkillRegistration): () => void
}

/** The Context this plugin's host half sees. */
export interface ControllerContextShape {
  webServer: WebServer
  sessions: Sessions
  webRuntime: WebRuntime
  tools: Tools
  skills?: Skills
}

export type Context = CordisContext & ControllerContextShape
