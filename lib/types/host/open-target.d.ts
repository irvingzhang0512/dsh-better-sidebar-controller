import type { ControllerCode } from '../shared/types.ts';
export declare function classifyOpenTarget(cwd: string, raw: string, title?: string): Promise<{
    ok: true;
    kind: 'file' | 'folder' | 'url';
    target: string;
    title: string;
} | {
    ok: false;
    code: ControllerCode;
    message: string;
}>;
