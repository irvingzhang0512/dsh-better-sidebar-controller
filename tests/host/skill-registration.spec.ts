/**
 * Bundled-skill self-registration tests: YAML frontmatter parsing (plain and
 * folded `>-` block scalars, malformed inputs) and the loader resolving the
 * real shipped SKILL.md into a valid `ctx.skills.register()` input.
 */
import { describe, expect, it } from 'vitest'
import { BUNDLED_SKILL_URL, loadBundledSkill, parseSkillFrontmatter } from '../../src/host/skill-registration.ts'

describe('parseSkillFrontmatter', () => {
  it('parses name and a folded description with whenToUse', () => {
    const raw = [
      '---',
      'name: sidebar-controller',
      'description: >-',
      '  通过 A 控制 B：',
      '  这是第二行。',
      'whenToUse: 当用户说打开文件时',
      '---',
      '# 正文',
      '内容。',
      '',
    ].join('\n')
    const parsed = parseSkillFrontmatter(raw)
    expect(parsed).toBeDefined()
    expect(parsed!.name).toBe('sidebar-controller')
    expect(parsed!.description).toBe('通过 A 控制 B： 这是第二行。')
    expect(parsed!.whenToUse).toBe('当用户说打开文件时')
    expect(parsed!.content).toBe('# 正文\n内容。')
  })

  it('parses a literal block scalar and CRLF line endings', () => {
    const raw = '---\r\nname: x\r\ndescription: |-\r\n  第一行\r\n  第二行\r\n---\r\n正文\r\n'
    const parsed = parseSkillFrontmatter(raw)
    expect(parsed!.description).toBe('第一行\n第二行')
    expect(parsed!.content).toBe('正文')
  })

  it('accepts a plain single-line description', () => {
    const parsed = parseSkillFrontmatter('---\nname: x\nwhenToUse: y\ndescription: 控制侧边栏。\n---\n正文')
    expect(parsed!.description).toBe('控制侧边栏。')
    expect(parsed!.content).toBe('正文')
  })

  it('strips a BOM', () => {
    const parsed = parseSkillFrontmatter('\uFEFF---\nname: x\ndescription: d\n---\n正文')
    expect(parsed!.name).toBe('x')
  })

  it('rejects missing frontmatter', () => {
    expect(parseSkillFrontmatter('# no frontmatter')).toBeUndefined()
  })

  it('rejects missing name or description', () => {
    expect(parseSkillFrontmatter('---\nname: x\n---\n正文')).toBeUndefined()
    expect(parseSkillFrontmatter('---\ndescription: d\n---\n正文')).toBeUndefined()
  })
})

describe('loadBundledSkill', () => {
  it('loads the real shipped SKILL.md into a valid registration', async () => {
    const skill = await loadBundledSkill()
    expect(skill).toBeDefined()
    expect(skill!.name).toBe('sidebar-controller')
    expect(skill!.description.length).toBeGreaterThan(20)
    expect(skill!.content).toContain('## 工具清单')
    expect(skill!.content).toContain('`get_sidebar_state`')
    expect(skill!.source).toBe('bundled')
    expect(skill!.provider).toBe('dsh-better-sidebar-controller')
  })

  it('anchors the bundled file at the package-root skills directory', () => {
    expect(BUNDLED_SKILL_URL.href).toMatch(/\/skills\/sidebar-controller\/SKILL\.md$/)
  })

  it('returns undefined for a missing file instead of throwing', async () => {
    const skill = await loadBundledSkill(new URL('../../does-not-exist/SKILL.md', import.meta.url))
    expect(skill).toBeUndefined()
  })
})
