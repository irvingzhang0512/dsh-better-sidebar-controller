import { type AccessState } from '../shared/access.ts';
import { resolveListingSettings } from './listing-settings.ts';
export interface SidebarEntry {
    options: {
        id?: string;
        name?: string;
    };
    disabled?: boolean;
    fiber?: {
        state: number;
        config?: unknown;
    };
    parent?: {
        tree: {
            ctx: {
                baseUrl?: string;
            };
        };
    };
}
export interface AccessSource {
    entries(): Iterable<SidebarEntry>;
    describe(): Array<{
        ns: string;
        value: unknown;
    }>;
    versionOf(entry: SidebarEntry): string | undefined;
}
/** Read the active upstream row, including aggregate bundle entry IDs. No client value authorizes tools. */
export declare function readSidebarAccess(source: AccessSource | undefined): AccessState & {
    listing: ReturnType<typeof resolveListingSettings>;
};
