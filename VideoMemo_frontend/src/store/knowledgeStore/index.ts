import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { KnowledgeSource } from '@/services/knowledge'

export interface KnowledgeMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: KnowledgeSource[]
}

export interface KnowledgeFilters {
  collectionIds: string[] // 选中的合集 id；空数组 = 不限合集
  includeUngrouped: boolean // 是否额外包含未分组的笔记（与 collectionIds 并集）
  platforms: string[] // 选中的平台；空数组 = 不限平台
  styles: string[] // 选中的笔记风格（formData.style 值，如 minimal/detailed/...）；空 = 不限
  dateFrom?: string // ISO date
  dateTo?: string
}

interface KnowledgeState {
  messages: KnowledgeMessage[]
  filters: KnowledgeFilters
  addMessage: (msg: KnowledgeMessage) => void
  clearMessages: () => void
  setFilters: (patch: Partial<KnowledgeFilters>) => void
  resetFilters: () => void
}

const defaultFilters: KnowledgeFilters = {
  collectionIds: [],
  includeUngrouped: false,
  platforms: [],
  styles: [],
  dateFrom: undefined,
  dateTo: undefined,
}

export const useKnowledgeStore = create<KnowledgeState>()(
  persist(
    set => ({
      messages: [],
      filters: defaultFilters,

      addMessage: msg =>
        set(state => ({ messages: [...state.messages, msg] })),

      clearMessages: () => set({ messages: [] }),

      setFilters: patch =>
        set(state => ({ filters: { ...state.filters, ...patch } })),

      resetFilters: () => set({ filters: defaultFilters }),
    }),
    {
      name: 'videomemo-knowledge-storage',
      // 老用户的持久化数据可能缺新加的 filters 字段（如 styles / includeUngrouped），
      // 用 merge 把 defaults 兜底叠加上去，避免读出 undefined 字段导致整页 crash。
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<KnowledgeState>
        return {
          ...current,
          ...p,
          filters: { ...defaultFilters, ...(p.filters ?? {}) },
        }
      },
    },
  ),
)
