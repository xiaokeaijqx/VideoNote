import { FC, JSX, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface ContextMenuItem {
  key: string
  label: string
  icon?: JSX.Element
  danger?: boolean
  onClick: () => void
}

interface IProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

const ContextMenu: FC<IProps> = ({ x, y, items, onClose }) => {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: y, left: x })

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', handle)
    window.addEventListener('contextmenu', handle)
    window.addEventListener('keydown', handleKey)
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('mousedown', handle)
      window.removeEventListener('contextmenu', handle)
      window.removeEventListener('keydown', handleKey)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  // 菜单出现后做一次边界自适应：超出视口右/下边界时反向贴边，避免被遮罩。
  useLayoutEffect(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = x
    let top = y
    if (left + rect.width > vw - 8) left = Math.max(8, vw - rect.width - 8)
    if (top + rect.height > vh - 8) top = Math.max(8, vh - rect.height - 8)
    if (left !== pos.left || top !== pos.top) setPos({ top, left })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y])

  // 用 portal 把菜单挂到 body，避免任何祖先的 transform / overflow / contain
  // 把 `position: fixed` 解释成相对 ancestor 而不是 viewport，导致定位偏移。
  const node = (
    <div
      ref={ref}
      style={{ top: pos.top, left: pos.left }}
      className="fixed z-[100] min-w-[140px] overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 shadow-lg"
    >
      {items.map(item => (
        <button
          key={item.key}
          onClick={() => {
            item.onClick()
            onClose()
          }}
          className={
            'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-100 ' +
            (item.danger ? 'text-red-600' : 'text-gray-700')
          }
        >
          {item.icon && <span className="h-4 w-4">{item.icon}</span>}
          {item.label}
        </button>
      ))}
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(node, document.body)
}

export default ContextMenu
