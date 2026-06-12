import { FC, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Flame, RefreshCw, Film, Newspaper } from 'lucide-react'
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

type CategoryTab = 'video' | 'article'

const VIDEO_FILTERS: Array<{ value: HotVideoPlatform; zh: string; en: string }> = [
  { value: 'all', zh: '全部', en: 'All' },
  { value: 'bilibili', zh: 'B 站', en: 'Bilibili' },
  { value: 'youtube', zh: 'YouTube', en: 'YouTube' },
  { value: 'douyin', zh: '抖音', en: 'Douyin' },
  { value: 'kuaishou', zh: '快手', en: 'Kuaishou' },
  { value: 'xiaohongshu', zh: '小红书', en: 'RED' },
]

const ARTICLE_FILTERS: Array<{ value: HotVideoPlatform; zh: string; en: string }> = [
  { value: 'all', zh: '全部', en: 'All' },
  { value: 'weibo', zh: '微博', en: 'Weibo' },
  { value: 'zhihu', zh: '知乎', en: 'Zhihu' },
  { value: 'baidu', zh: '百度', en: 'Baidu' },
  { value: '36kr', zh: '36氪', en: '36kr' },
  { value: 'ithome', zh: 'IT之家', en: 'ITHome' },
]

// When loading "all" under article tab, actually request each article platform
const ARTICLE_ALL_PLATFORMS: HotVideoPlatform[] = ['weibo', 'zhihu', 'baidu', '36kr', 'ithome']
const VIDEO_ALL_PLATFORMS: HotVideoPlatform[] = [
  'bilibili',
  'youtube',
  'douyin',
  'kuaishou',
  'xiaohongshu',
]

const DEFAULT_MESSAGES: Record<HotVideoItemPlatform, string> = {
  bilibili: 'B 站热点暂时获取失败',
  youtube: 'YouTube 热点暂时获取失败',
  douyin: '抖音热点受风控限制，稍后刷新或手动粘贴链接',
  kuaishou: '快手热点暂时获取失败，可手动粘贴链接',
  xiaohongshu: '小红书暂未提供稳定公开视频热点源',
  weibo: '微博热点暂时获取失败',
  zhihu: '知乎热点暂时获取失败',
  baidu: '百度热点暂时获取失败',
  '36kr': '36氪热点暂时获取失败',
  ithome: 'IT之家热点暂时获取失败',
}

export interface HotVideoRecommendationsProps {
  onSelect: (item: HotVideoItem) => void
  standalone?: boolean
}

const HotVideoRecommendations: FC<HotVideoRecommendationsProps> = ({
  onSelect,
  standalone = false,
}) => {
  const lang = useVmLang()
  const [category, setCategory] = useState<CategoryTab>('video')
  const [active, setActive] = useState<HotVideoPlatform>('all')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<HotVideoPlatformResult[]>([])
  const [error, setError] = useState('')

  const filters = category === 'video' ? VIDEO_FILTERS : ARTICLE_FILTERS

  const load = async (platform: HotVideoPlatform, cat: CategoryTab, force = false) => {
    setLoading(true)
    setError('')
    setResults([])
    try {
      if (platform === 'all') {
        // Fetch all platforms in the current category in parallel
        const targets = cat === 'video' ? VIDEO_ALL_PLATFORMS : ARTICLE_ALL_PLATFORMS
        const responses = await Promise.all(
          targets.map(p => listHotVideos(p, 12, force).catch(() => null)),
        )
        const merged: HotVideoPlatformResult[] = []
        for (const resp of responses) {
          if (resp?.platforms) merged.push(...resp.platforms)
        }
        setResults(merged)
      } else {
        const data = await listHotVideos(platform, 12, force)
        setResults(data.platforms || [])
      }
    } catch (e: any) {
      setResults([])
      setError(e?.msg || (lang === 'zh' ? '热点推荐暂时不可用' : 'Recommendations unavailable'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(active, category)
  }, [active, category])

  // When switching categories, reset active platform to 'all'
  const handleCategoryChange = (cat: CategoryTab) => {
    setCategory(cat)
    setActive('all')
  }

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
      {/* Header row */}
      <div className="vm-row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div className="vm-row" style={{ gap: 8 }}>
          <span style={{ color: 'var(--vm-primary)', display: 'grid' }}>
            <Flame size={16} />
          </span>
          <div style={{ fontWeight: 800, fontSize: 14 }}>
            {lang === 'zh' ? '热点推荐' : 'Trending'}
          </div>
        </div>
        <button
          type="button"
          className="vm-btn vm-btn-ghost vm-btn-sm"
          onClick={() => load(active, category, true)}
          disabled={loading}
          title={lang === 'zh' ? '刷新热点推荐' : 'Refresh recommendations'}
          style={{ width: 34, paddingInline: 0 }}
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Category tabs: Video / Article */}
      <div
        className="vm-seg"
        style={{ marginBottom: 12, display: 'inline-flex', width: '100%', boxSizing: 'border-box' }}
      >
        <button
          className={'vm-seg-item' + (category === 'video' ? ' active' : '')}
          style={{ flex: 1, gap: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => handleCategoryChange('video')}
        >
          <Film size={13} />
          {lang === 'zh' ? '视频热点' : 'Video Trends'}
        </button>
        <button
          className={'vm-seg-item' + (category === 'article' ? ' active' : '')}
          style={{ flex: 1, gap: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => handleCategoryChange('article')}
        >
          <Newspaper size={13} />
          {lang === 'zh' ? '图文资讯' : 'News & Articles'}
        </button>
      </div>

      {/* Platform filter chips */}
      <div className="vm-chip-row" style={{ marginBottom: 12 }}>
        {filters.map(filter => (
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

      {/* Results */}
      <div style={{ minHeight: 132 }}>
        {loading ? (
          <div className="vm-field-hint" style={{ padding: '22px 0' }}>
            {lang === 'zh' ? '正在获取热点...' : 'Loading trending...'}
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
                    isArticle={category === 'article'}
                  />
                ))}
              </div>
            ) : (
              <div className="vm-field-hint" style={{ padding: '18px 0' }}>
                {lang === 'zh'
                  ? category === 'article'
                    ? '暂无图文资讯热点，可手动粘贴链接。'
                    : '暂无可展示的热点视频，可手动粘贴链接。'
                  : category === 'article'
                    ? 'No article trends. Paste a link manually.'
                    : 'No video recommendations. Paste a link manually.'}
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

const HotVideoRow: FC<{
  item: HotVideoItem
  onSelect: (item: HotVideoItem) => void
  isArticle?: boolean
}> = ({ item, onSelect, isArticle = false }) => {
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
        gridTemplateColumns: isArticle ? '42px minmax(0, 1fr)' : '64px minmax(0, 1fr)',
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
          width: isArticle ? 42 : 64,
          height: isArticle ? 42 : 42,
          borderRadius: 6,
          overflow: 'hidden',
          background: 'var(--vm-surface-2)',
          position: 'relative',
          flexShrink: 0,
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
          {isArticle && (
            <span
              style={{
                fontSize: 10,
                padding: '1px 6px',
                borderRadius: 4,
                background: 'var(--vm-surface-2)',
                color: 'var(--vm-muted)',
                marginLeft: 'auto',
                whiteSpace: 'nowrap',
              }}
            >
              {lang === 'zh' ? '图文' : 'Article'}
            </span>
          )}
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
