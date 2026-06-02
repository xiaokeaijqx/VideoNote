import { FC, ReactNode } from 'react'

export const Field: FC<{
  label: ReactNode
  en?: ReactNode
  hint?: ReactNode
  children: ReactNode
  style?: React.CSSProperties
}> = ({ label, en, hint, children, style }) => (
  <div className="vm-field" style={style}>
    <div className="vm-field-head">
      <span className="vm-field-label">{label}</span>
      {en && <span className="vm-field-hint">{en}</span>}
      {hint && <span className="vm-field-hint" style={{ marginLeft: 2 }}>· {hint}</span>}
    </div>
    {children}
  </div>
)
