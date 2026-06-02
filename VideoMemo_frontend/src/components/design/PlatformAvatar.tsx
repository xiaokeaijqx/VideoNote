import { FC } from 'react'

export interface PlatformBrand {
  zh: string
  en: string
  short: string
  color: string
}

export const PLATFORMS: Record<string, PlatformBrand> = {
  bilibili: { zh: '哔哩哔哩', en: 'Bilibili', short: 'B', color: '#FB7299' },
  youtube: { zh: 'YouTube', en: 'YouTube', short: 'YT', color: '#FF0033' },
  douyin: { zh: '抖音', en: 'Douyin', short: '抖', color: '#161823' },
  kuaishou: { zh: '快手', en: 'Kuaishou', short: '快', color: '#FF5000' },
  xiaohongshu: { zh: '小红书', en: 'RED', short: '红', color: '#FF2442' },
  local: { zh: '本地视频', en: 'Local', short: '⬡', color: '#64748B' },
}

export const Pf: FC<{ id: string; sm?: boolean }> = ({ id, sm }) => {
  const p = PLATFORMS[id] || { short: '?', color: '#94a3b8' }
  return (
    <div className={'vm-pf' + (sm ? ' vm-pf-sm' : '')} style={{ background: p.color }}>
      {p.short}
    </div>
  )
}

export const platformLabel = (id: string, lang: 'zh' | 'en' = 'zh'): string => {
  const p = PLATFORMS[id]
  return p ? p[lang] : id || '-'
}
