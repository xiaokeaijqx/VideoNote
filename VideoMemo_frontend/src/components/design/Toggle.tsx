import { FC } from 'react'

export const Toggle: FC<{ on: boolean; onClick: () => void; disabled?: boolean }> = ({ on, onClick, disabled }) => (
  <button
    type="button"
    className={'vm-toggle' + (on ? ' on' : '')}
    onClick={onClick}
    disabled={disabled}
  >
    <i />
  </button>
)
