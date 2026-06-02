import { Switch } from '@/components/ui/switch'
import { FC } from 'react'
import styles from './index.module.css'
import { useNavigate, useParams } from 'react-router-dom'
import AILogo from '@/components/Form/modelForm/Icons'
import { useProviderStore } from '@/store/providerStore'

export interface IProviderCardProps {
  id: string
  providerName: string
  Icon: string
  enable: number
}

const ProviderCard: FC<IProviderCardProps> = ({
  providerName,
  Icon,
  id,
}: IProviderCardProps) => {
  const navigate = useNavigate()
  const updateProvider = useProviderStore(state => state.updateProvider)
  const enabled = useProviderStore(state => state.provider.find(p => p.id === id)?.enabled)

  const isChecked = enabled === 1

  const handleToggle = (checked: boolean) => {
    const allProviders = useProviderStore.getState().provider
    const provider = allProviders.find(p => p.id === id)
    if (!provider) return
    updateProvider({
      ...provider,
      enabled: checked ? 1 : 0,
    })
  }

  // @ts-ignore
  const { id: currentId } = useParams()
  const isActive = currentId === id

  return (
    <div
      className={
        styles.card +
        ' flex h-14 w-full cursor-pointer items-center justify-between gap-2 rounded border border-[#f3f3f3] px-3' +
        (isActive ? ' bg-[#F0F0F0] font-semibold text-blue-600' : '')
      }
      // 整行可点跳转到对应供应商编辑页（之前 onClick 只挂在 icon+名字那一小块 div 上，
      // 名字和开关之间的空白区域点不动）
      onClick={() => navigate(`/settings/model/${id}`)}
    >
      {/* 左：图标 + 名称。min-w-0 + truncate 防止超长名字把右侧 Switch 推走，
          导致开关列上下对不齐 */}
      <div className="flex min-w-0 flex-1 items-center gap-2 text-lg">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center">
          <AILogo name={Icon} />
        </div>
        <div className="truncate font-semibold">{providerName}</div>
      </div>

      {/* 右：Switch。显式 items-center + shrink-0，确保跨行 Switch 完全对齐。
          Switch 自身的点击不应冒泡触发整行跳转 */}
      <div
        className="flex shrink-0 items-center"
        onClick={e => e.stopPropagation()}
      >
        <Switch checked={isChecked} onCheckedChange={handleToggle} />
      </div>
    </div>
  )
}
export default ProviderCard
