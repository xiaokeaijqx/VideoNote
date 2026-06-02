import { FC } from 'react'

/**
 * 新版 VideoMemo 品牌标记：
 * - 圆角方底用主题主色 → 深主色对角渐变，自然有质感
 * - 上半：放大的播放三角（video）
 * - 下半：2 条笔记长短线（memo）
 * - 右上角：小亮点（AI 高光）
 * 默认 44×44，比旧版 38 大一圈，配合左上 sidebar 的品牌区视觉更稳。
 */
export const BrandMark: FC<{ size?: number }> = ({ size = 44 }) => {
  const id = `vm-grad-${size}`
  return (
    <div
      className="vm-brand-mark"
      style={{
        width: size,
        height: size,
        background: 'transparent',
        boxShadow: 'none',
      }}
    >
      <svg
        viewBox="0 0 48 48"
        width={size}
        height={size}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block' }}
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="var(--vm-primary)" />
            <stop offset="1" stopColor="var(--vm-primary-strong)" />
          </linearGradient>
        </defs>

        {/* 圆角底 + 主题渐变 */}
        <rect width="48" height="48" rx="12" fill={`url(#${id})`} />

        {/* 内层柔和高光，避免大色块发死 */}
        <rect
          x="2"
          y="2"
          width="44"
          height="44"
          rx="10"
          fill="white"
          fillOpacity="0.04"
        />

        {/* 中央播放三角（视频） */}
        <path
          d="M18 13 L18 28 L31 20.5 Z"
          fill="white"
          style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.18))' }}
        />

        {/* 下方两条笔记线（备忘） */}
        <rect x="12" y="32" width="24" height="3" rx="1.5" fill="white" fillOpacity="0.92" />
        <rect x="12" y="37.5" width="16" height="3" rx="1.5" fill="white" fillOpacity="0.6" />

        {/* 右上角 AI 高光小亮点 */}
        <circle cx="38" cy="10" r="2.4" fill="white" fillOpacity="0.95" />
        <circle cx="38" cy="10" r="3.6" fill="white" fillOpacity="0.18" />
      </svg>
    </div>
  )
}
