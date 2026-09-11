/**
 * Bundled-skill self-registration.
 *
 * The plugin ships `skills/sidebar-controller/SKILL.md` (canonical, human
 * authored) and the host half registers it on `ctx.skills` at mount time, so
 * installing the plugin is enough — no manual copy into a skills directory.
 * This module owns the SKILL.md → `SkillRegistration` conversion: YAML
 * frontmatter parsing (name / description / whenToUse; plain and folded `>-`
 * block scalars) plus a load helper that resolves the bundled file relative
 * to the host entry and degrades gracefully (missing/unreadable → undefined,
 * never a crash).
 */
import { readFile } from 'node:fs/promises'
import type { SkillRegistration } from '@deepseek-ai/dsh-skill'

/** Skill directory bundle shipped by this package (relative to src/ or lib/). */
export const BUNDLED_SKILL_DIR = '../../skills/sidebar-controller'

/** URL of the bundled SKILL.md, anchored to THIS module — src/host/ and the
 *  built lib/host/ sit at the same depth, so one URL serves both. */
export const BUNDLED_SKILL_URL = new URL(`${BUNDLED_SKILL_DIR}/SKILL.md`, import.meta.url)

/** Parsed result of a skill file's YAML frontmatter block. */
export interface ParsedSkillFrontmatter {
  name: string
  description: string
  whenToUse?: string
  /** Markdown body after the closing `---` (leading blank line trimmed). */
  content: string
}

/**
 * Parse the `---` frontmatter of a SKILL.md. Supports plain scalars and
 * folded `>` / literal `|` block scalars (`>-` / `|-` variants) for
 * description / whenToUse. Returns `undefined` for anything that is not a
 * valid skill file (no frontmatter, or missing name/description).
 */
export function parseSkillFrontmatter(raw: string): ParsedSkillFrontmatter | undefined {
  let text = raw
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1) // strip BOM
  if (!text.startsWith('---')) return undefined
  const firstLf = text.indexOf('\n')
  if (firstLf === -1) return undefined
  const rest = text.slice(firstLf + 1)
  const close = /^---[ \t]*$/m.exec(rest)
  if (close === null) return undefined
  const front = rest.slice(0, close.index)
  const content = rest.slice(close.index + close[0].length)

  const fields = new Map<string, string>()
  const lines = front.split(/\r?\n/)
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (line.trim() === '' || /^\s*#/.test(line)) {
      i += 1
      continue
    }
    const match = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line)
    if (match === null) {
      i += 1
      continue
    }
    const key = match[1]!
    let value = match[2]!.trim()
    const block = /^([>|-])(-)?$/.exec(value)
    if (block !== null) {
      // Folded (`>`) joins continuation lines with spaces; literal (`|`)
      // keeps them. Continuation lines are the indented ones after the key.
      const parts: string[] = []
      i += 1
      while (i < lines.length && /^[ \t]/.test(lines[i]!)) {
        parts.push(lines[i]!.replace(/^[ \t]+/, ''))
        i += 1
      }
      value = block[1] === '|' ? parts.join('\n') : parts.join(' ')
    } else {
      i += 1
    }
    fields.set(key, value)
  }

  const name = fields.get('name')
  const description = fields.get('description')
  if (name === undefined || name === '' || description === undefined || description === '') {
    return undefined
  }
  const result: ParsedSkillFrontmatter = {
    name,
    description,
    content: content.replace(/^\r?\n/, '').replace(/\s+$/, ''),
  }
  const whenToUse = fields.get('whenToUse')
  if (whenToUse !== undefined && whenToUse !== '') result.whenToUse = whenToUse
  return result
}

/**
 * Load the bundled SKILL.md into a runtime skill registration.
 * @param fileUrl - override for the bundled file URL (used by tests);
 *   defaults to {@link BUNDLED_SKILL_URL}.
 * @returns the registration, or `undefined` when the file is missing,
 *   unreadable, or fails frontmatter validation.
 */
export async function loadBundledSkill(fileUrl: string | URL = BUNDLED_SKILL_URL): Promise<SkillRegistration | undefined> {
  try {
    const raw = await readFile(fileUrl, 'utf8')
    const parsed = parseSkillFrontmatter(raw)
    if (parsed === undefined) return undefined
    const registration: SkillRegistration = {
      name: parsed.name,
      description: parsed.description,
      content: parsed.content,
      source: 'bundled',
      provider: 'dsh-better-sidebar-controller',
      ...(parsed.whenToUse !== undefined ? { whenToUse: parsed.whenToUse } : {}),
    }
    return registration
  } catch {
    // Missing or unreadable bundled file: registration is a convenience, not
    // a hard requirement — never crash the host mount over it.
    return undefined
  }
}
