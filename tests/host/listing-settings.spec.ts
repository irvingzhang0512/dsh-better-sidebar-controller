/**
 * Side-card listing settings (SPEC F009): defensive normalization of the
 * values the browser pushes and of better-sidebar's own `pluginSettings`
 * blob, plus the per-session mirror's default behavior.
 */
import { describe, expect, it } from 'vitest'
import { resolveListingSettings } from '../../src/host/listing-settings.ts'
import { LISTING_SETTINGS_DEFAULTS, MAX_LISTED_ENTRIES_MIN } from '../../src/shared/types.ts'

describe('resolveListingSettings', () => {
  it('falls back to the documented defaults for a missing blob', () => {
    expect(resolveListingSettings(undefined)).toEqual(LISTING_SETTINGS_DEFAULTS)
    expect(resolveListingSettings({})).toEqual({ includeHiddenEntries: true, maxListedEntries: 1000 })
  })
  it('keeps explicit values (unset includeHiddenEntries still defaults to true)', () => {
    expect(resolveListingSettings({ includeHiddenEntries: false, maxListedEntries: 3 }))
      .toEqual({ includeHiddenEntries: false, maxListedEntries: 3 })
    expect(resolveListingSettings({ includeHiddenEntries: true }))
      .toEqual({ includeHiddenEntries: true, maxListedEntries: 1000 })
  })
  it('counts a present non-true boolean as OFF, but an absent key as the default', () => {
    expect(resolveListingSettings({ includeHiddenEntries: false }).includeHiddenEntries).toBe(false)
    expect(resolveListingSettings({ includeHiddenEntries: 'true' }).includeHiddenEntries).toBe(false)
    expect(resolveListingSettings({ includeHiddenEntries: 1 }).includeHiddenEntries).toBe(false)
    expect(resolveListingSettings({ includeHiddenEntries: null }).includeHiddenEntries).toBe(false)
    expect(resolveListingSettings({ maxListedEntries: 3 }).includeHiddenEntries).toBe(true)
  })
  it('falls back to 1000 for non-finite / non-number bounds', () => {
    for (const bad of [NaN, Infinity, -Infinity, '50', null, {}, []]) {
      expect(resolveListingSettings({ maxListedEntries: bad }).maxListedEntries).toBe(1000)
    }
  })
  it('clamps a bound below the minimum instead of failing', () => {
    expect(resolveListingSettings({ maxListedEntries: 0 }).maxListedEntries).toBe(MAX_LISTED_ENTRIES_MIN)
    expect(resolveListingSettings({ maxListedEntries: -5 }).maxListedEntries).toBe(MAX_LISTED_ENTRIES_MIN)
  })
  it('floors a fractional bound', () => {
    expect(resolveListingSettings({ maxListedEntries: 2.9 }).maxListedEntries).toBe(2)
  })
  it('tolerates a non-record blob (array / primitive)', () => {
    expect(resolveListingSettings([])).toEqual(LISTING_SETTINGS_DEFAULTS)
    expect(resolveListingSettings('nope')).toEqual(LISTING_SETTINGS_DEFAULTS)
    expect(resolveListingSettings(42)).toEqual(LISTING_SETTINGS_DEFAULTS)
  })
})
