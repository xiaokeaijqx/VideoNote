import { FC } from 'react'
import HotVideoRecommendations from '@/pages/HomePage/components/HotVideoRecommendations'
import type { HotVideoItem } from '@/services/hotVideos'

const HotVideos: FC = () => {
  const handleSelect = (item: HotVideoItem) => {
    if (item.url) window.open(item.url, '_blank')
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
