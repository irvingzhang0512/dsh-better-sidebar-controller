/** 由目标宿主统一校验 Host、Origin 和浏览器／API 身份，不另开回环豁免。 */
export function isTrustedApiRequest(request, connection) {
    return connection.requestRejection(request) === undefined;
}
