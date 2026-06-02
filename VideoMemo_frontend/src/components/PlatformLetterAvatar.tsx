import { FC } from 'react'

/**
 * 根据平台名称生成首字母头像。
 * - 拉丁字母 → 大写首字母（Vimeo → V）
 * - 中文/emoji 等多字节字符 → 首个码点（微博 → 微）
 * 背景色按 name hash 稳定挑选，同名永远同色。
 */
const AVATAR_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
  '#F7B731', '#5F27CD', '#00B894', '#E17055', '#6C5CE7',
]

interface IProps {
  name: string
  /** 边长（px），默认 28。常见尺寸传 16 给小图标位。 */
  size?: number
  className?: string
}

const PlatformLetterAvatar: FC<IProps> = ({ name, size = 28, className = '' }) => {
  const first = Array.from((name || '').trim())[0] || '?'
  const display = /[A-Za-z]/.test(first) ? first.toUpperCase() : first
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  const bg = AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
  // 字号约为边长的 50%，最小 10px
  const fontSize = Math.max(10, Math.round(size * 0.5))
  return (
    <div
      className={'flex shrink-0 items-center justify-center rounded-md font-bold text-white ' + className}
      style={{ width: size, height: size, backgroundColor: bg, fontSize }}
    >
      {display}
    </div>
  )
}

export default PlatformLetterAvatar
