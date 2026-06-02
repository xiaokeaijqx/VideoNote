import { FC, useEffect, useState } from 'react'
import { PLATFORMS } from './PlatformAvatar'
import { coverCandidates } from '@/utils/cover'

export const gradFor = (id: string): string => {
  const c = PLATFORMS[id]?.color || '#888'
  return `linear-gradient(135deg, ${c}, color-mix(in srgb, ${c} 55%, #000))`
}

interface NoteThumbProps {
  platform: string
  /** 视频封面 URL；优先用这个，没拿到再回退到平台色渐变 */
  coverUrl?: string
  size?: 'sm' | 'lg'
  className?: string
}

/**
 * 笔记缩略图：有封面就显示封面图（左侧列表 / 阅读区 banner 都用这个）。
 * 封面按 coverCandidates 给出的候选顺序尝试（本地化路径 → 直链 → image_proxy），
 * 全部失败时退回到平台色渐变 + 播放三角，避免页面出现破图。
 */
export const NoteThumb: FC<NoteThumbProps> = ({
  platform,
  coverUrl,
  size = 'sm',
  className = '',
}) => {
  const candidates = coverCandidates(coverUrl)
  const [idx, setIdx] = useState(0)
  // coverUrl 变化（如切换笔记复用组件）时重置尝试进度
  useEffect(() => setIdx(0), [coverUrl])

  const src = idx < candidates.length ? candidates[idx] : undefined
  const isLg = size === 'lg'
  const baseClass = (isLg ? 'vm-banner-thumb ' : 'vm-note-thumb ') + className

  if (src) {
    return (
      <div className={baseClass} style={{ background: '#000' }}>
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setIdx(i => i + 1)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      </div>
    )
  }

  return (
    <div className={baseClass} style={{ background: gradFor(platform) }}>
      <span
        className="vm-ply"
        style={
          isLg
            ? {
                borderLeftWidth: 14,
                borderTopWidth: 9,
                borderBottomWidth: 9,
              }
            : undefined
        }
      />
    </div>
  )
}
