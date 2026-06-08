import { FC } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import HotVideoRecommendations from '@/pages/HomePage/components/HotVideoRecommendations'
import type { HotVideoItem } from '@/services/hotVideos'
import { useTaskStore } from '@/store/taskStore'
import { useVmLang } from '@/i18n/redesign'

const DRAFT_KEY = 'vm-note-draft'

function mergeHotVideoDraft(item: HotVideoItem) {
  try {
    const previous = localStorage.getItem(DRAFT_KEY)
    const draft = previous ? JSON.parse(previous) : {}
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        ...draft,
        platform: item.platform,
        url: item.url,
      }),
    )
  } catch {
    /* ignore */
  }
}

const HotVideos: FC = () => {
  const lang = useVmLang()
  const navigate = useNavigate()
  const setCurrentTask = useTaskStore(s => s.setCurrentTask)

  const handleSelect = (item: HotVideoItem) => {
    mergeHotVideoDraft(item)
    setCurrentTask(null)
    toast.success(lang === 'zh' ? '已填入热点视频链接' : 'Trending video selected')
    navigate('/', { state: { createFromHot: true } })
  }

  return (
    <div className="vm-content-inner narrow vm-fade-up">
      <div className="vm-card vm-card-pad">
        <HotVideoRecommendations onSelect={handleSelect} standalone />
      </div>
    </div>
  )
}

export default HotVideos
