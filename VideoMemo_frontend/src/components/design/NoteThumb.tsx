import { FC, useState } from 'react'
import { PLATFORMS } from './PlatformAvatar'

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
 * 笔记缩略图：有封面就显示封面图（左侧列表 / 阅读区 banner 都用这个），
 * 拿不到封面或加载失败时退回到平台色渐变 + 播放三角，避免页面出现破图。
 */
export const NoteThumb: FC<NoteThumbProps> = ({
  platform,
  coverUrl,
  size = 'sm',
  className = '',
}) => {
  const [broken, setBroken] = useState(false)
  const showCover = coverUrl && !broken
  const isLg = size === 'lg'
  const baseClass = (isLg ? 'vm-banner-thumb ' : 'vm-note-thumb ') + className

  if (showCover) {
    return (
      <div className={baseClass} style={{ background: '#000' }}>
        <img
          src={coverUrl}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
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
