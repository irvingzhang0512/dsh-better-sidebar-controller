/**
 * Skill contract test: the shipped SKILL.md must (a) declare the mandatory
 * frontmatter (kebab-case name + description), (b) document every controller
 * tool, and (c) cover every natural-language intent category the requirements
 * call out. This guards against the Skill and Tools drifting apart.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { CONTROLLER_TOOL_NAMES } from '../src/host/tools.ts'
import { parseSkillFrontmatter } from '../src/host/skill-registration.ts'

const SKILL_PATH = fileURLToPath(new URL('../skills/sidebar-controller/SKILL.md', import.meta.url))

describe('SKILL.md contract', () => {
  let skill: string
  beforeAll(async () => {
    skill = await readFile(SKILL_PATH, 'utf8')
  })

  it('declares mandatory frontmatter (name kebab-case, description)', () => {
    expect(skill).toMatch(/^---\n/)
    const nameMatch = skill.match(/^name:\s*(.+)$/m)
    expect(nameMatch).not.toBeNull()
    expect(nameMatch![1]!.trim()).toBe('sidebar-controller')
    expect(skill).toMatch(/^description:\s*>/m)
    // description must mention the tools for discovery
    expect(skill.toLowerCase()).toContain('better-sidebar')
  })

  it('parses to the same registration the host self-registers', () => {
    const parsed = parseSkillFrontmatter(skill)
    expect(parsed).toBeDefined()
    expect(parsed!.name).toBe('sidebar-controller')
    expect(parsed!.description.length).toBeGreaterThan(20)
    expect(parsed!.content).toContain('## 工具清单')
  })

  it('documents every registered tool in the tools table', () => {
    for (const tool of CONTROLLER_TOOL_NAMES) {
      expect(skill).toContain(`\`${tool}\``)
    }
  })

  it('covers every natural-language intent category of requirements §5', () => {
    const cases: Array<[string, string]> = [
      ['获取侧边栏/工作区状态', '哪个文件'],
      ['打开/关闭侧边栏', '打开侧边栏'],
      ['查看文件树', '列出文件'],
      ['展开/收起文件夹', '展开'],
      ['打开文件', '打开'],
      ['关闭文件', '关闭当前文件'],
      ['切换当前文件', '切到'],
      ['返回上一个文件', '回到刚才那个文件'],
      ['刷新文件树', '刷新文件树'],
    ]
    for (const [intent, keyword] of cases) {
      expect(skill, `intent "${intent}" should mention "${keyword}"`).toContain(keyword)
    }
  })
})
