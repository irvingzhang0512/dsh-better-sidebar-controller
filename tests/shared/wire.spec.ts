/**
 * Wire protocol tests: every encode/parse path round-trips, and malformed
 * input is rejected with a WireError (the bridge drops the message).
 */
import { describe, expect, it } from 'vitest'
import {
  WireError,
  encodeAck,
  encodeClientState,
  encodeHostCommand,
  parseClientMessage,
  parseCommand,
  parseHostMessage,
} from '../../src/shared/wire.ts'

const SID = 'session-abc'

describe('parseCommand', () => {
  it('accepts every command name', () => {
    expect(parseCommand({ name: 'show_sidebar' })).toEqual({ name: 'show_sidebar' })
    expect(parseCommand({ name: 'hide_sidebar' })).toEqual({ name: 'hide_sidebar' })
    expect(parseCommand({ name: 'refresh_tree' })).toEqual({ name: 'refresh_tree' })
    expect(parseCommand({ name: 'reopen_previous_file' })).toEqual({ name: 'reopen_previous_file' })
    expect(parseCommand({ name: 'sync_state' })).toEqual({ name: 'sync_state' })
    expect(parseCommand({ name: 'expand_folder', path: '/a' })).toEqual({ name: 'expand_folder', path: '/a' })
    expect(parseCommand({ name: 'collapse_folder', path: '/a' })).toEqual({ name: 'collapse_folder', path: '/a' })
    expect(parseCommand({ name: 'open_file', path: '/a', title: 'a.md' })).toEqual({ name: 'open_file', path: '/a', title: 'a.md' })
    expect(parseCommand({ name: 'open_file', path: '/a', title: '' })).toEqual({ name: 'open_file', path: '/a' })
    expect(parseCommand({ name: 'activate_file', path: '/a' })).toEqual({ name: 'activate_file', path: '/a' })
    expect(parseCommand({ name: 'close_file', path: '/a' })).toEqual({ name: 'close_file', path: '/a' })
    expect(parseCommand({ name: 'close_file' })).toEqual({ name: 'close_file' })
  })
  it('rejects unknown names and missing paths', () => {
    expect(() => parseCommand({ name: 'nuke' })).toThrow(WireError)
    expect(() => parseCommand({ name: 'expand_folder' })).toThrow(WireError)
    expect(() => parseCommand({ name: 'open_file' })).toThrow(WireError)
    expect(() => parseCommand('nope')).toThrow(WireError)
  })
})

describe('client → host messages', () => {
  it('hello round-trips', () => {
    const msg = parseClientMessage(JSON.stringify({ type: 'hello', sessionId: SID }))
    expect(msg).toEqual({ type: 'hello', sessionId: SID })
  })
  it('state round-trips (including nulls)', () => {
    const text = encodeClientState({
      sessionId: SID,
      sidebarVisible: true,
      currentFile: null,
      previousFile: '/a.md',
      openedFiles: ['/a.md'],
      expandedFolders: ['/root'],
      updatedAt: 1234,
    })
    const msg = parseClientMessage(text)
    expect(msg).toEqual({
      type: 'state',
      state: {
        sessionId: SID,
        sidebarVisible: true,
        currentFile: null,
        previousFile: '/a.md',
        openedFiles: ['/a.md'],
        expandedFolders: ['/root'],
        updatedAt: 1234,
      },
    })
  })
  it('command-result round-trips with value', () => {
    const text = encodeAck({ id: 'cmd-1', ok: true, code: 'OK', message: 'done', value: { path: '/a.md' } })
    const msg = parseClientMessage(text)
    expect(msg).toEqual({ type: 'command-result', result: { id: 'cmd-1', ok: true, code: 'OK', message: 'done', value: { path: '/a.md' } } })
  })
  it('rejects malformed envelopes', () => {
    expect(() => parseClientMessage('not json')).toThrow(WireError)
    expect(() => parseClientMessage(JSON.stringify({ type: 'hello' }))).toThrow(WireError)
    expect(() => parseClientMessage(JSON.stringify({ type: 'hello', sessionId: '' }))).toThrow(WireError)
    expect(() => parseClientMessage(JSON.stringify({ type: 'nope' }))).toThrow(WireError)
    expect(() => parseClientMessage(JSON.stringify({ type: 'state', state: { sessionId: SID, openedFiles: 'x' } }))).toThrow(WireError)
    expect(() => parseClientMessage(JSON.stringify({ type: 'command-result', result: { id: 'x' } }))).toThrow(WireError)
  })
})

describe('host → client messages', () => {
  it('command round-trips', () => {
    const text = encodeHostCommand('cmd-1', { name: 'open_file', path: '/a.md' })
    const msg = parseHostMessage(text)
    expect(msg).toEqual({ type: 'command', id: 'cmd-1', command: { name: 'open_file', path: '/a.md' } })
  })
  it('rejects malformed host messages', () => {
    expect(() => parseHostMessage('not json')).toThrow(WireError)
    expect(() => parseHostMessage(JSON.stringify({ type: 'state' }))).toThrow(WireError)
    expect(() => parseHostMessage(JSON.stringify({ type: 'command', id: 'x' }))).toThrow(WireError)
    expect(() => parseHostMessage(JSON.stringify({ type: 'command', id: 'x', command: { name: 'bad' } }))).toThrow(WireError)
  })
})
