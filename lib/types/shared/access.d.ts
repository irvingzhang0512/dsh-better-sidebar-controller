import type { ControllerCode } from './types.ts';
export declare const ANCHOR_ID = "dsh-better-sidebar-controller:anchor";
export interface AccessState {
    available: boolean;
    open: boolean;
    control: boolean;
    code?: ControllerCode;
    message?: string;
}
export declare function allowed(name: string, access: AccessState): boolean;
export declare function accessFromPrefs(raw: unknown): AccessState;
export declare function refusal(name: string, access: AccessState): {
    ok: false;
    code: ControllerCode;
    message: string;
} | undefined;
