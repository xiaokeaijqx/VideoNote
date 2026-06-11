import { FC, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Flame, RefreshCw } from 'lucide-react'
import { listHotVideos } from '@/services/hotVideos'
import type {
  HotVideoItem,
  HotVideoItemPlatform,
  HotVideoPlatform,
  HotVideoPlatformResult,
} from '@/services/hotVideos'
import { Pf, PLATFORMS } from '@/components/design/PlatformAvatar'
import { Chip } from '@/components/design/Chip'
import { useVmLang } from '@/i18n/redesign'

const FILTERS: Array<{ value: HotVideoPlatform; zh: string; en: string }> = [
  { value: 'all', zh: '全部', en: 'All' },
  { value: 'bilibili', zh: 'B 站', en: 'Bilibili' },
  { value: 'youtube', zh: 'YouTube', en: 'YouTube' },
  { value: 'douyin', zh: '抖音', en: 'Douyin' },
  { value: 'kuaishou', zh: '快手', en: 'Kuaishou' },
  { value: 'xiaohongshu', zh: '小红书', en: 'RED' },
]

const DEFAULT_MESSAGES: Record<HotVideoItemPlatform, string> = {
  bilibili: 'B 站热点暂时获取失败',
  youtube: 'YouTube 热点暂时获取失败',
  douyin: '抖音热点受风控限制，稍后刷新或手动粘贴链接',
  kuaishou: '快手热点暂时获取失败，可手动粘贴链接',
  xiaohongshu: '小红书暂未提供稳定公开视频热点源',
}

export interface HotVideoRecommendationsProps {
  onSelect: (item: HotVideoItem) => void
  standalone?: boolean
}

const HotVideoRecommendations: FC<HotVideoRecommendationsProps> = ({ onSelect, standalone = false }) => {
  const lang = useVmLang()
  const [active, setActive] = useState<HotVideoPlatform>('all')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<HotVideoPlatformResult[]>([])
  const [error, setError] = useState('')

  const load = async (platform: HotVideoPlatform, force = false) => {
    setLoading(true)
    setError('')
    try {
      const data = await listHotVideos(platform, 12, force)
      setResults(data.platforms || [])
    } catch (e: any) {
      setResults([])
      setError(e?.msg || (lang === 'zh' ? '热点推荐暂时不可用' : 'Recommendations unavailable'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(active)
  }, [active])

  const items = useMemo(
    () => results.flatMap(result => (result.status === 'ok' ? result.items : [])),
    [results],
  )
  const notices = useMemo(() => results.filter(result => result.status !== 'ok'), [results])

  return (
    <div
      style={
        standalone
          ? {}
          : { marginTop: 14, borderTop: '1px solid var(--vm-border)', paddingTop: 14 }
      }
    >
      <div className="vm-row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <div className="vm-row" style={{ gap: 8 }}>
          <span style={{ color: 'var(--vm-primary)', display: 'grid' }}>
            <Flame size={16} />
          </span>
          <div style={{ fontWeight: 800, fontSize: 14 }}>
            {lang === 'zh' ? '热点推荐' : 'Trending videos'}
          </div>
        </div>
        <button
          type="button"
          className="vm-btn vm-btn-ghost vm-btn-sm"
          onClick={() => load(active, true)}
          disabled={loading}
          title={lang === 'zh' ? '刷新热点推荐' : 'Refresh recommendations'}
          style={{ width: 34, paddingInline: 0 }}
        >
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="vm-chip-row" style={{ marginBottom: 12 }}>
        {FILTERS.map(filter => (
          <Chip
            key={filter.value}
            on={active === filter.value}
            onClick={() => setActive(filter.value)}
            withCheck={false}
          >
            {filter[lang]}
          </Chip>
        ))}
      </div>

      <div style={{ minHeight: 132 }}>
        {loading ? (
          <div className="vm-field-hint" style={{ padding: '22px 0' }}>
            {lang === 'zh' ? '正在获取热点视频...' : 'Loading trending videos...'}
          </div>
        ) : error ? (
          <div className="vm-badge vm-badge-warn" style={{ borderRadius: 'var(--vm-radius-sm)' }}>
            <AlertCircle size={15} /> {error}
          </div>
        ) : (
          <>
            {items.length > 0 ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {items.map(item => (
                  <HotVideoRow
                    key={`${item.platform}:${item.id}`}
                    item={item}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            ) : (
              <div className="vm-field-hint" style={{ padding: '18px 0' }}>
                {lang === 'zh'
                  ? '暂无可展示的热点视频，可手动粘贴链接。'
                  : 'No recommendations available. Paste a link manually.'}
              </div>
            )}
            {notices.length > 0 && (
              <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
                {notices.map(result => (
                  <div key={result.platform} className="vm-field-hint">
                    {PLATFORMS[result.platform]?.[lang] || result.platform}:
                    {' '}
                    {result.message || DEFAULT_MESSAGES[result.platform]}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const HotVideoRow: FC<{ item: HotVideoItem; onSelect: (item: HotVideoItem) => void }> = ({
  item,
  onSelect,
}) => {
  const lang = useVmLang()
  const [coverFailed, setCoverFailed] = useState(false)
  const meta = [item.author, item.hot_score].filter(Boolean).join(' · ')
  const coverUrl = item.cover_url?.replace(/^http:\/\//, 'https://')
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      title={item.title}
      style={{
        display: 'grid',
        gridTemplateColumns: '64px minmax(0, 1fr)',
        gap: 10,
        width: '100%',
        padding: 8,
        textAlign: 'left',
        border: '1px solid var(--vm-border)',
        borderRadius: 'var(--vm-radius-sm)',
        background: 'var(--vm-surface)',
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          width: 64,
          height: 42,
          borderRadius: 6,
          overflow: 'hidden',
          background: 'var(--vm-surface-2)',
          position: 'relative',
        }}
      >
        {coverUrl && !coverFailed ? (
          <img
            src={coverUrl}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setCoverFailed(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
            <Pf id={item.platform} sm />
          </div>
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="vm-row" style={{ gap: 7, marginBottom: 4 }}>
          <Pf id={item.platform} sm />
          <span className="vm-field-hint">
            #{item.rank || '-'} · {PLATFORMS[item.platform]?.[lang] || item.platform}
          </span>
        </div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--vm-text)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {item.title}
        </div>
        {meta && (
          <div
            className="vm-field-hint"
            style={{
              marginTop: 3,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {meta}
          </div>
        )}
      </div>
    </button>
  )
}

export default HotVideoRecommendations
