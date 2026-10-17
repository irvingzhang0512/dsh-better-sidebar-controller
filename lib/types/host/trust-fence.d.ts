import type { ConnectionTrustRequest, HostConnectionHandle } from "@deepseek-ai/dsh-client-connection";
/** 由目标宿主统一校验 Host、Origin 和浏览器／API 身份，不另开回环豁免。 */
export declare function isTrustedApiRequest(request: ConnectionTrustRequest, connection: Pick<HostConnectionHandle, "requestRejection">): boolean;
