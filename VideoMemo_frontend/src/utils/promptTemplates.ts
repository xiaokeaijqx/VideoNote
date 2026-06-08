export interface PromptTemplate {
  id: string
  label: string
  description: string
  prompt: string
}

const STORAGE_KEY = 'vm-prompt-templates'

export const DEFAULT_PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'technical',
    label: '技术文档',
    description: '保留术语、命令、架构和代码细节',
    prompt:
      '请把笔记整理成技术文档：保留关键术语、命令、配置、代码片段和架构关系；遇到实现步骤时用有序列表写清楚前置条件、操作和结果。',
  },
  {
    id: 'tutorial',
    label: '教程步骤',
    description: '适合课程、操作演示和工具教程',
    prompt:
      '请把笔记整理成教程：按目标、准备、步骤、常见问题和结果检查组织；每个步骤尽量写出用户可以照做的操作。',
  },
  {
    id: 'action',
    label: '行动清单',
    description: '提炼任务、决策和后续动作',
    prompt:
      '请重点提炼可执行事项：把任务、决策、风险、负责人线索和下一步动作列清楚；少写背景，多写可以直接执行的清单。',
  },
  {
    id: 'meeting',
    label: '会议纪要',
    description: '适合访谈、讨论和会议录屏',
    prompt:
      '请整理成会议纪要：包含会议主题、关键讨论、结论、待办事项、风险和未决问题；语气正式，避免营销化表达。',
  },
  {
    id: 'social',
    label: '传播文案',
    description: '适合公众号、小红书和短内容复盘',
    prompt:
      '请整理成适合传播的内容：保留核心信息和亮点，标题更有吸引力，段落短，适当使用金句式总结，但不要夸大视频没有提到的内容。',
  },
]

function readStoredTemplates() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, string>
  } catch {
    return {}
  }
}

function writeStoredTemplates(templates: Record<string, string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
}

export function loadPromptTemplates(): PromptTemplate[] {
  const stored = readStoredTemplates()
  return DEFAULT_PROMPT_TEMPLATES.map(template => ({
    ...template,
    prompt: stored[template.id] ?? template.prompt,
  }))
}

export function savePromptTemplate(id: string, prompt: string) {
  const stored = readStoredTemplates()
  stored[id] = prompt
  writeStoredTemplates(stored)
}

export function resetPromptTemplate(id: string) {
  const stored = readStoredTemplates()
  delete stored[id]
  writeStoredTemplates(stored)
}

export function getDefaultPromptTemplate(id: string) {
  return DEFAULT_PROMPT_TEMPLATES.find(template => template.id === id)
}
