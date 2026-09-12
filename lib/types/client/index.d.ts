/**
 * dsh-better-sidebar-controller — client half (browser).
 *
 * Runs only when `ctx.betterSidebar` is provided (i.e. dsh-better-sidebar is
 * installed): a soft dependency — the host half mounts regardless, and this
 * module simply never activates otherwise.
 *
 * Responsibilities:
 * 1. State mirror — derives the controller state (current/previous file,
 *    opened files, expanded folders, sidebar visibility) from every
 *    better-sidebar snapshot and pushes it to the host bridge. Because the
 *    snapshot observes every mouse interaction, user operations and Agent
 *    operations share one state.
 * 2. Bridge client — attaches to `/sidebar-controller/ws?sessionId=…` for
 *    the ACTIVE session, receives tool commands from the host, applies them
 *    through the better-sidebar service / store, and acknowledges.
 * 3. Store access — captures the sidebar store through a hidden anchor tab
 *    registered via the PUBLIC `registerTab` API. This is the minimal,
 *    non-invasive way to mutate `state.expanded` (expand/collapse) and panel
 *    visibility without modifying better-sidebar's core. The anchor renders
 *    nothing and is removed as soon as the store has been captured.
 */
import type { Context } from 'dsh-better-sidebar';
export declare const inject: string[];
/**
 * Client plugin body.
 * @param ctx - the client cordis context (betterSidebar injected).
 */
export declare function apply(ctx: Context): void;
