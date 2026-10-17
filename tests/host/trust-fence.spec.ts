import { describe, expect, it, vi } from 'vitest'
import { isTrustedApiRequest } from '../../src/host/trust-fence.ts'

describe('desktop bridge trust fence', () => {
  it('does not exempt loopback or the native origin from Host authentication', () => {
    const request = { headers: { host: '127.0.0.1:19387', origin: 'dsh-app://app' } }
    const requestRejection = vi.fn(() => 401 as const)
    expect(isTrustedApiRequest(request, { requestRejection })).toBe(false)
    expect(requestRejection).toHaveBeenCalledWith(request)
    expect(isTrustedApiRequest(request, { requestRejection: () => 403 })).toBe(false)
  })
  it('accepts a request only when the running Host has admitted it', () => {
    const request = { headers: { host: '127.0.0.1:19387', origin: 'http://127.0.0.1:19387', cookie: 'fixture-signed-cookie' } }
    expect(isTrustedApiRequest(request, { requestRejection: () => undefined })).toBe(true)
  })
})
