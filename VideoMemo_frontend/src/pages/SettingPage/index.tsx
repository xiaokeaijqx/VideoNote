import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { useProviderStore } from '@/store/providerStore'

/**
 * 设置组的容器：左侧菜单由 MainLayout 的 SettingsGroup 提供，
 * 这里仅负责渲染嵌套子路由 + 初始化 provider 列表。
 */
const SettingPage = () => {
  const fetchProviderList = useProviderStore(state => state.fetchProviderList)
  useEffect(() => {
    fetchProviderList()
  }, [])
  return (
    <div className="h-full w-full">
      <Outlet />
    </div>
  )
}
export default SettingPage
