import type { Context } from './context-types.ts';
/** Plugin identity for cordis.yml rows. */
export declare const name = "dsh-better-sidebar-controller";
/** Services required before mounting: the webserver upgrade surface, the
 *  session store (authoritative cwd), the web runtime's trusted hosts, the
 *  tool registry, and the skill registry (for self-registering the bundled
 *  SKILL.md so installing the plugin also installs its skill). */
export declare const inject: string[];
/** Bridge upgrade path (must match the client half). */
export declare const BRIDGE_PATH = "/sidebar-controller/ws";
/**
 * Plugin body: mount the bridge endpoint and the controller tools.
 * @param ctx - host plugin context (tools, webServer, sessions, webRuntime).
 */
export declare function apply(ctx: Context): void;
