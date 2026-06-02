import { FC, MouseEvent, ReactNode } from 'react'
import { Check } from 'lucide-react'

export const Chip: FC<{
  on?: boolean
  disabled?: boolean
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
  children: ReactNode
  withCheck?: boolean
  style?: React.CSSProperties
}> = ({ on, disabled, onClick, children, withCheck = true, style }) => (
  <button
    type="button"
    className={'vm-chip' + (on ? ' on' : '')}
    disabled={disabled}
    onClick={onClick}
    style={style}
  >
    {withCheck && (
      <span className="vm-chk">{on && <Check size={11} strokeWidth={3} />}</span>
    )}
    {children}
  </button>
)
