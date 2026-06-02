import { FC, ReactNode } from 'react'

export const Segmented: FC<{
  value: string
  onChange: (v: string) => void
  options: { value: string; label: ReactNode }[]
}> = ({ value, onChange, options }) => (
  <div className="vm-seg">
    {options.map(o => (
      <button
        key={o.value}
        type="button"
        className={'vm-seg-item' + (o.value === value ? ' active' : '')}
        onClick={() => onChange(o.value)}
      >
        {o.label}
      </button>
    ))}
  </div>
)
