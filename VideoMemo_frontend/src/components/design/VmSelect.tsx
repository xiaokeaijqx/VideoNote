import { FC, ReactNode, useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

export interface VmSelectOption {
  value: string
  label?: ReactNode
}

export const VmSelect: FC<{
  value: string
  onChange: (v: string) => void
  options: VmSelectOption[]
  placeholder?: string
  renderOption?: (o: VmSelectOption) => ReactNode
  width?: number | string
  disabled?: boolean
}> = ({ value, onChange, options, placeholder, renderOption, width, disabled }) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const cur = options.find(o => o.value === value)
  return (
    <div ref={ref} style={{ position: 'relative', width: width || '100%' }}>
      <button
        type="button"
        className="vm-select-trigger"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', minWidth: 0 }}>
          {cur ? (
            renderOption ? (
              renderOption(cur)
            ) : (
              cur.label ?? cur.value
            )
          ) : (
            <span className="vm-faint">{placeholder}</span>
          )}
        </span>
        <span
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s', display: 'grid' }}
        >
          <ChevronDown size={16} />
        </span>
      </button>
      {open && (
        <div
          className="vm-fade-up"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 50,
            background: 'var(--vm-surface)',
            border: '1px solid var(--vm-border)',
            borderRadius: 'var(--vm-radius-sm)',
            boxShadow: 'var(--vm-shadow-md)',
            padding: 6,
            maxHeight: 300,
            overflowY: 'auto',
          }}
        >
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value)
                setOpen(false)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                width: '100%',
                textAlign: 'left',
                padding: '9px 10px',
                borderRadius: 'calc(var(--vm-radius-sm) - 2px)',
                border: 'none',
                background: o.value === value ? 'var(--vm-primary-soft)' : 'transparent',
                color: o.value === value ? 'var(--vm-primary-strong)' : 'var(--vm-text)',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => {
                if (o.value !== value)
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--vm-surface-2)'
              }}
              onMouseLeave={e => {
                if (o.value !== value)
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
              }}
            >
              {renderOption ? renderOption(o) : o.label ?? o.value}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
