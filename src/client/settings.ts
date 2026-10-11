import { createElement as h } from 'react'
import guide from 'virtual:sidebar-controller-guide'
import type { SidebarSettingsRenderProps } from 'dsh-better-sidebar/client/service'
import { accessFromPrefs } from '../shared/access.ts'
import { resolveListingSettings } from '../shared/listing-settings.ts'

/** Kept visible even when model management is disabled. Uses upstream persistence helpers. */
export function ControllerSettings(props: SidebarSettingsRenderProps) {
  const { pluginSettings: own, updatePluginSetting: update } = props
  const access = accessFromPrefs(props.prefs)
  const listing = resolveListingSettings(own)
  const row = (title: string, desc: string, input: ReturnType<typeof h>) => h('label', { style: { display: 'flex', justifyContent: 'space-between', gap: 16, margin: '16px 0' } }, h('span', null, h('strong', null, title), h('div', { style: { opacity: .7, fontSize: 12 } }, desc)), input)
  const toggle = (key: string, value: boolean, title: string, desc: string) => row(title, desc, h('input', { type: 'checkbox', role: 'switch', 'aria-label': title, checked: value, style: { appearance: 'none', flexShrink: 0, width: 36, height: 20, borderRadius: 10, cursor: 'pointer', background: `radial-gradient(circle at ${value ? '26px' : '10px'} 10px, white 7px, transparent 8px), ${value ? '#2563eb' : '#9ca3af'}` }, onChange: (e: { target: { checked: boolean } }) => update(key, e.target.checked) }))
  return h('div', null,
    h('p', null, '增强 better-sidebar 的 Agent 控制：打开文件、文件夹与网页，管理文件树及文件标签。'),
    h('p', { role: 'status' }, `打开能力：${access.open ? '开启' : '关闭'}；管理能力：${access.control ? '开启' : '关闭'}${!access.available ? '（扩展当前不可用）' : ''}`),
    h('p', null, '打开能力跟随本页「常规 → 为模型注入侧边栏打开工具」，同时提供 sidebar_open、better_sidebar_open 和兼容 open_file。'),
    toggle('agentControlTools', own.agentControlTools === true, '允许模型管理侧边栏', '启用状态查询、显隐、目录列举／展开／折叠／刷新、文件关闭／切换。两个开关均开启时可返回上一文件。默认关闭。'),
    own.agentControlTools === true ? h('div', null,
      toggle('includeHiddenEntries', listing.includeHiddenEntries, '列出隐藏项', '列举与刷新返回点开头的隐藏条目。'),
      row('单层条目上限', '超出时返回 truncated，默认 1000。', h('input', { type: 'number', min: 1, value: listing.maxListedEntries, onChange: (e: { target: { value: string } }) => { const n = Number(e.target.value); if (Number.isFinite(n)) update('maxListedEntries', Math.max(1, Math.floor(n))) } }))) : null,
    h('p', null, '试着对 Agent 说：“用侧边栏控制技能打开 docs/会议纪要.md”“现在打开的是哪个文件？”“在文件树里展开 docs”“回到刚才那个文件”。'),
    h('details', null, h('summary', null, '查看 Agent 使用说明'),
      h('pre', { style: { whiteSpace: 'pre-wrap', fontFamily: 'inherit', overflowWrap: 'anywhere', maxHeight: '60vh', overflowY: 'auto' } }, guide)))
}
