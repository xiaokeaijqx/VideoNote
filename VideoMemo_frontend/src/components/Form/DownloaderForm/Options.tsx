import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import ProviderCard from '@/components/Form/DownloaderForm/providerCard.tsx'
import { Button } from '@/components/ui/button.tsx'
import PlatformLetterAvatar from '@/components/PlatformLetterAvatar'
import { videoPlatforms } from '@/constant/note.ts'
import {
  listCustomPlatforms,
  deleteCustomPlatform,
  type CustomPlatform,
} from '@/services/downloader'
import { setCustomPlatforms } from '@/utils/platform'
import CustomPlatformDialog from './CustomPlatformDialog'

const Options = () => {
  const navigate = useNavigate()
  // @ts-ignore
  const { id: currentId } = useParams()

  const [custom, setCustom] = useState<CustomPlatform[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)

  const refresh = async () => {
    try {
      const list = await listCustomPlatforms()
      const arr = Array.isArray(list) ? list : []
      setCustom(arr)
      setCustomPlatforms(arr) // 同步进 detectPlatform 的缓存
    } catch {
      setCustom([])
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const handleDelete = async (key: string) => {
    if (!confirm('删除该自定义平台?Cookie 配置也会一起清掉。')) return
    try {
      await deleteCustomPlatform(key)
      toast.success('已删除')
      await refresh()
    } catch {
      toast.error('删除失败')
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm font-light">下载器配置</div>
      <div className="flex flex-col gap-1">
        {videoPlatforms &&
          videoPlatforms.map((provider, index) => {
            if (provider.value !== 'local')
              return (
                <ProviderCard
                  key={index}
                  providerName={provider.label}
                  Icon={provider?.logo}
                  id={provider.value}
                />
              )
          })}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <div className="text-sm font-light">自定义平台</div>
        <Button size="sm" variant="ghost" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          添加
        </Button>
      </div>

      {custom.length === 0 ? (
        <div className="rounded border border-dashed border-neutral-200 p-3 text-xs text-gray-400">
          可添加任何 yt-dlp 支持的平台（如 Vimeo / TikTok / 微博等），保存后在生成笔记时可用。
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {custom.map(cp => (
            <div
              key={cp.key}
              onClick={() => navigate(`/settings/download/${cp.key}`)}
              className={
                'group flex h-14 cursor-pointer items-center justify-between gap-2 rounded border border-[#f3f3f3] px-3 hover:bg-neutral-50 ' +
                (currentId === cp.key ? 'bg-[#F0F0F0] font-semibold text-blue-600' : '')
              }
            >
              <div className="flex min-w-0 flex-1 items-center gap-2 text-base">
                <PlatformLetterAvatar name={cp.name} />
                <div className="min-w-0">
                  <div className="truncate font-semibold">{cp.name}</div>
                  <div className="truncate text-xs text-gray-400">{cp.match}</div>
                </div>
              </div>
              <button
                onClick={e => {
                  e.stopPropagation()
                  handleDelete(cp.key)
                }}
                className="rounded p-1.5 text-gray-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <CustomPlatformDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={async () => {
          await refresh()
        }}
      />
    </div>
  )
}
export default Options
