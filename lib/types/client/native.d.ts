/** Public native inventory face; no private stores or cross-plugin value imports. */
export interface NativeSidebar {
    mounted: {
        getSnapshot(): string | undefined;
        subscribe(listener: () => void): () => void;
    };
    openTabs: {
        getSnapshot(): readonly NativeTab[];
        subscribe(listener: () => void): () => void;
    };
    active(): {
        id: string;
        contentId: string;
        kind: string;
    } | undefined;
    isExpanded(): boolean;
    toggleExpanded(): void;
    focus(id: string): void;
    close(id: string): void;
    openTab(kind: string, options?: {
        params?: Record<string, unknown>;
    }): void;
}
export interface NativeTab {
    sessionId: string;
    tabId: string;
    contentId: string;
    kind: string;
}
/** HTTP stays on the desktop page's forwarding scheme; WebSocket uses the public shell transport. */
export declare function bridgeUrl(httpRoute: string, streamBaseUrl?: string): URL;
export declare function pathKey(path: string): string;
export declare function resourcePath(address: string, sessionId: string, cwd?: string): string | undefined;
