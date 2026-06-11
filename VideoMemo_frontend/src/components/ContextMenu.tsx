import { FC, JSX, MouseEvent, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

export interface ContextMenuItem {
  key: string
  label: string
  icon?: JSX.Element
  danger?: boolean
  disabled?: boolean
  onClick?: () => void
  // 有 children 时该项作为子菜单入口（hover 右侧展开），onClick 可省略
  children?: ContextMenuItem[]
}

interface IProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

const itemClass = (item: ContextMenuItem) =>
  'group flex h-9 w-full items-center justify-between gap-3 rounded-md px-2.5 text-left text-[13px] font-medium outline-none transition-colors ' +
  (item.disabled
    ? 'cursor-default text-[color:var(--vm-faint)] opacity-55'
    : item.danger
      ? 'text-[color:var(--vm-danger,#dc2626)] hover:bg-[color:var(--vm-danger-soft,#fee2e2)]'
      : 'text-[color:var(--vm-text,#1f2937)] hover:bg-[color:var(--vm-surface-2,#f5f5f5)]')

const ContextMenu: FC<IProps> = ({ x, y, items, onClose }) => {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: y, left: x })
  const [openSub, setOpenSub] = useState<string | null>(null)
  const [subPlacement, setSubPlacement] = useState({ below: true, alignRight: false })
  // hover 意图延时：父项 ↔ 子菜单之间移动时不立刻关闭，避免「移过去就消失」
  const subTimer = useRef<number | null>(null)
  const openSubmenu = (key: string, el?: HTMLElement) => {
    if (subTimer.current) window.clearTimeout(subTimer.current)
    if (el && typeof window !== 'undefined') {
      const rect = el.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom - 10
      const spaceAbove = rect.top - 10
      const below = spaceBelow >= 168 || spaceBelow >= spaceAbove
      const alignRight = rect.left + 224 > window.innerWidth - 10
      setSubPlacement({ below, alignRight })
    }
    setOpenSub(key)
  }
  const scheduleCloseSub = () => {
    if (subTimer.current) window.clearTimeout(subTimer.current)
    subTimer.current = window.setTimeout(() => setOpenSub(null), 180)
  }
  useEffect(() => () => {
    if (subTimer.current) window.clearTimeout(subTimer.current)
  }, [])

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
      className="fixed z-[100] min-w-[176px] rounded-lg border border-[color:var(--vm-border,#e5e7eb)] bg-[color:var(--vm-surface,#fff)] p-1.5 shadow-[var(--vm-shadow-lg,0_18px_50px_-16px_rgba(0,0,0,0.3))]"
    >
      {items.map(item => {
        if (item.children?.length) {
          return (
            <div
              key={item.key}
              className="relative"
              onMouseEnter={(e: MouseEvent<HTMLDivElement>) => openSubmenu(item.key, e.currentTarget)}
              onMouseLeave={scheduleCloseSub}
            >
              <button className={itemClass(item)}>
                <span className="flex min-w-0 items-center gap-2.5">
                  {item.icon && (
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-[color:var(--vm-surface-2,#f5f5f5)] text-[color:var(--vm-muted,#6b7280)]">
                      {item.icon}
                    </span>
                  )}
                  <span className="truncate">{item.label}</span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-[color:var(--vm-faint,#9ca3af)]" />
              </button>
              {openSub === item.key && (
                <div
                  onMouseEnter={(e: MouseEvent<HTMLDivElement>) => openSubmenu(item.key, e.currentTarget.parentElement || undefined)}
                  onMouseLeave={scheduleCloseSub}
                  className={
                    'vm-ctx-scroll absolute z-[101] max-h-[280px] min-w-[220px] overflow-y-auto rounded-lg border border-[color:var(--vm-border,#e5e7eb)] bg-[color:var(--vm-surface,#fff)] p-1.5 shadow-[var(--vm-shadow-lg,0_18px_50px_-16px_rgba(0,0,0,0.3))] ' +
                    (subPlacement.below ? 'top-full mt-1' : 'bottom-full mb-1') +
                    ' ' +
                    (subPlacement.alignRight ? 'right-0' : 'left-0')
                  }
                >
                  {item.children.map(sub => (
                    <button
                      key={sub.key}
                      disabled={sub.disabled}
                      onClick={() => {
                        if (sub.disabled) return
                        sub.onClick?.()
                        onClose()
                      }}
                      className={itemClass(sub)}
                    >
                      <span className="flex min-w-0 items-center gap-2.5 truncate">
                        {sub.icon && (
                          <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-[color:var(--vm-surface-2,#f5f5f5)] text-[color:var(--vm-muted,#6b7280)]">
                            {sub.icon}
                          </span>
                        )}
                        <span className="truncate">{sub.label}</span>
                      </span>
                      {sub.disabled && <Check className="h-4 w-4 shrink-0 text-[color:var(--vm-ok,#16a34a)]" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        }
        return (
          <button
            key={item.key}
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return
              item.onClick?.()
              onClose()
            }}
            className={itemClass(item)}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              {item.icon && (
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-[color:var(--vm-surface-2,#f5f5f5)] text-[color:var(--vm-muted,#6b7280)]">
                  {item.icon}
                </span>
              )}
              <span className="truncate">{item.label}</span>
            </span>
          </button>
        )
      })}
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(node, document.body)
}

export default ContextMenu
