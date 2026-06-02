import { FC } from 'react'
import { trVm, useVmLang } from '@/i18n/redesign'

export const StatusBadge: FC<{ status: string }> = ({ status }) => {
  const lang = useVmLang()
  if (status === 'SUCCESS')
    return (
      <span className="vm-badge vm-badge-ok">
        <span className="vm-dot" />
        {trVm('done', lang)}
      </span>
    )
  if (status === 'FAILED' || status === 'FAILD')
    return (
      <span className="vm-badge vm-badge-danger">
        <span className="vm-dot" />
        {trVm('failed', lang)}
      </span>
    )
  return (
    <span className="vm-badge vm-badge-warn">
      <span className="vm-dot" style={{ animation: 'vm-pulse-ring 1.5s infinite' }} />
      {trVm('running', lang)}
    </span>
  )
}
