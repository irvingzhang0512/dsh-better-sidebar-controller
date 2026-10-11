import { describe, expect, it } from 'vitest'
import { isTrustedApiRequest } from '../../src/host/trust-fence.ts'

describe('desktop bridge trust fence', () => {
  it('accepts only the official custom origin on loopback without cross-site markers', () => {
    expect(isTrustedApiRequest({ headers: { host: '127.0.0.1:19387', origin: 'dsh-app://app' } }, [])).toBe(true)
    expect(isTrustedApiRequest({ headers: { host: 'localhost:19387', origin: 'dsh-app://app', 'sec-fetch-site': 'cross-site' } }, [])).toBe(false)
    expect(isTrustedApiRequest({ headers: { host: 'trusted.example', origin: 'dsh-app://app' } }, ['trusted.example'])).toBe(false)
    expect(isTrustedApiRequest({ headers: { host: '127.0.0.1:19387', origin: 'dsh-app://evil' } }, [])).toBe(false)
  })
})
