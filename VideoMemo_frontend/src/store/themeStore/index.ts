import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type VmTheme = 'slate' | 'warm' | 'sage' | 'mono'
export type VmLang = 'zh' | 'en'

export const VM_THEMES: { id: VmTheme; zh: string; en: string; descZh: string; descEn: string; dots: [string, string, string] }[] = [
  { id: 'slate', zh: '精工', en: 'Slate', descZh: '克制 · 工具感', descEn: 'Crisp · tool-like', dots: ['#4B45E0', '#0E9FD6', '#F6F7F9'] },
  { id: 'warm', zh: '暖记', en: 'Warm', descZh: '温暖 · 知识感', descEn: 'Warm · studious', dots: ['#D2682F', '#2F8068', '#F7F1E7'] },
  { id: 'sage', zh: '晨雾', en: 'Sage', descZh: '清新 · 专注', descEn: 'Fresh · focused', dots: ['#2F8F6B', '#C2823A', '#EFF3EF'] },
  { id: 'mono', zh: '墨白', en: 'Mono', descZh: '黑白 · 极简', descEn: 'Mono · minimal', dots: ['#111111', '#5C5C5C', '#FFFFFF'] },
]

interface ThemeState {
  theme: VmTheme
  lang: VmLang
  showNavEn: boolean
  setTheme: (t: VmTheme) => void
  setLang: (l: VmLang) => void
  setShowNavEn: (v: boolean) => void
}

const applyTheme = (theme: VmTheme) => {
  if (typeof document === 'undefined') return
  document.body.setAttribute('data-vm-switching', '')
  document.body.setAttribute('data-theme', theme)
  window.setTimeout(() => document.body.removeAttribute('data-vm-switching'), 60)
}

export const useThemeStore = create<ThemeState>()(
  persist(
    set => ({
      theme: 'slate',
      lang: 'zh',
      showNavEn: true,
      setTheme: theme => {
        applyTheme(theme)
        set({ theme })
      },
      setLang: lang => set({ lang }),
      setShowNavEn: showNavEn => set({ showNavEn }),
    }),
    {
      name: 'vm-theme',
      onRehydrateStorage: () => state => {
        if (state && typeof document !== 'undefined') {
          document.body.setAttribute('data-theme', state.theme)
        }
      },
    },
  ),
)
