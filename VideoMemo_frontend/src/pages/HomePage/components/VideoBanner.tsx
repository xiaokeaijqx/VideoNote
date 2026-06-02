import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import type { AudioMeta } from '@/store/taskStore'

interface VideoBannerProps {
  audioMeta?: AudioMeta
  videoUrl?: string
}

/** 平台 label 映射 */
const platformLabel: Record<string, string> = {
  bilibili: '哔哩哔哩',
  youtube: 'YouTube',
  douyin: '抖音',
  xiaohongshu: '小红书',
}

export default function VideoBanner({ audioMeta, videoUrl }: VideoBannerProps) {
  // 图片加载失败时回退到渐变背景，不显示破图占位 + alt 文字。
  const [coverBroken, setCoverBroken] = useState(false)

  if (!audioMeta) return null

  // 直接拿 cover_url，配合 <img referrerPolicy="no-referrer">；与左侧 NoteThumb 同
  // 一招——XHS / B 站 / YouTube CDN 都允许「无 Referer」拉图，不走 image_proxy。
  const coverUrl = !coverBroken ? audioMeta.cover_url || '' : ''
  const title = audioMeta.title
  const uploader = audioMeta.raw_info?.uploader || ''
  const platform = platformLabel[audioMeta.platform] || audioMeta.platform || ''
  const originalUrl = videoUrl || audioMeta.raw_info?.webpage_url || ''

  return (
    <div className="relative mb-4 overflow-hidden rounded-lg">
      {/* 模糊背景封面：渐变兜底；图片加载成功时叠在上面 */}
      <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-700">
        {coverUrl && (
          <img
            src={coverUrl}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setCoverBroken(true)}
            className="h-full w-full scale-110 object-cover blur-md brightness-[0.4]"
          />
        )}
      </div>

      {/* 内容层 */}
      <div className="relative flex items-center gap-4 px-5 py-4">
        {/* 封面缩略图：alt 留空，加载失败时不会暴露 title 文字到破图占位 */}
        {coverUrl && (
          <img
            src={coverUrl}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setCoverBroken(true)}
            className="h-16 w-28 shrink-0 rounded-md object-cover shadow-md"
          />
        )}

        {/* 文字信息 */}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-bold text-white" title={title}>
            {title}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/70">
            {uploader && <span>{uploader}</span>}
            {uploader && platform && <span className="text-white/40">·</span>}
            {platform && <span>{platform}</span>}
          </div>
        </div>

        {/* 跳转原视频 */}
        {originalUrl && (
          <a
            href={originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/25"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>原视频</span>
          </a>
        )}
      </div>
    </div>
  )
}
