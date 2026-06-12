import { FC, useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Bell,
  BellPlus,
  Check,
  ExternalLink,
  GripVertical,
  Loader2,
  MoreHorizontal,
  Plus,
  Radio,
  RefreshCw,
  TrendingUp,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { listHotVideos, isArticlePlatform, ALL_PLATFORMS, type HotVideoItemPlatform } from '@/services/hotVideos'
import type { HotVideoItem, HotVideoPlatformResult } from '@/services/hotVideos'
import { PLATFORMS, Pf } from '@/components/design/PlatformAvatar'
import { useVmLang } from '@/i18n/redesign'
import { createTrendSubscription, listNotificationChannels, updateTrendSubscription, triggerMatch } from '@/services/trendSubscription'

// ─── Persistent layout ──────────────────────────────────────────────────────────

const LAYOUT_KEY = 'vm-trends-layout'

interface TrendsLayout {
  order: string[]    // ordered list of platform IDs to show
  hidden: string[]   // platform IDs hidden by user (but still available to re-add)
  custom: string[]   // custom platform IDs added by user
}

function loadLayout(): TrendsLayout {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (raw) return JSON.parse(raw) as TrendsLayout
  } catch { /* ignore */ }
  return { order: [], hidden: [], custom: [] }
}

function saveLayout(layout: TrendsLayout) {
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)) } catch { /* ignore */ }
}

// ─── Platform groups ────────────────────────────────────────────────────────────

type PlatformGroup = 'video' | 'news' | 'finance' | 'dev' | 'subscribed'

interface PlatformConfig {
  id: HotVideoItemPlatform
  group: PlatformGroup[]
}

const PLATFORM_CONFIGS: PlatformConfig[] = [
  // Video
  { id: 'bilibili', group: ['video'] },
  { id: 'bilibili-hot-search', group: ['video'] },
  { id: 'youtube', group: ['video'] },
  { id: 'douyin', group: ['video'] },
  { id: 'kuaishou', group: ['video'] },
  { id: 'xiaohongshu', group: ['video'] },
  // News
  { id: 'weibo', group: ['news'] },
  { id: 'zhihu', group: ['news'] },
  { id: 'baidu', group: ['news'] },
  { id: 'toutiao', group: ['news'] },
  { id: 'thepaper', group: ['news'] },
  { id: 'ifeng', group: ['news'] },
  { id: 'tieba', group: ['news'] },
  { id: 'hupu', group: ['news'] },
  { id: 'tencent', group: ['news'] },
  { id: 'cankaoxiaoxi', group: ['news'] },
  { id: 'zaobao', group: ['news'] },
  { id: 'douban', group: ['news'] },
  // Finance
  { id: 'wallstreetcn', group: ['finance'] },
  { id: 'wallstreetcn-hot', group: ['finance'] },
  { id: 'wallstreetcn-news', group: ['finance'] },
  { id: 'wallstreetcn-quick', group: ['finance'] },
  { id: 'cls', group: ['finance'] },
  { id: 'cls-hot', group: ['finance'] },
  { id: 'cls-telegraph', group: ['finance'] },
  { id: 'cls-depth', group: ['finance'] },
  { id: '36kr', group: ['finance'] },
  { id: '36kr-quick', group: ['finance'] },
  { id: '36kr-renqi', group: ['finance'] },
  { id: 'jin10', group: ['finance'] },
  { id: 'gelonghui', group: ['finance'] },
  { id: 'xueqiu', group: ['finance'] },
  { id: 'xueqiu-hotstock', group: ['finance'] },
  // Tech
  { id: 'github', group: ['dev'] },
  { id: 'github-trending-today', group: ['dev'] },
  { id: 'hackernews', group: ['dev'] },
  { id: 'v2ex', group: ['dev'] },
  { id: 'v2ex-share', group: ['dev'] },
  { id: 'producthunt', group: ['dev'] },
  { id: 'juejin', group: ['dev'] },
  { id: 'ithome', group: ['dev'] },
  { id: 'sspai', group: ['dev'] },
  { id: 'solidot', group: ['dev'] },
  { id: 'coolapk', group: ['dev'] },
]

const GROUPS: Array<{ key: PlatformGroup; zh: string; en: string; icon: typeof Radio }> = [
  { key: 'dev', zh: '科技', en: 'Tech', icon: TrendingUp },
  { key: 'finance', zh: '财经', en: 'Finance', icon: TrendingUp },
  { key: 'news', zh: '资讯', en: 'News', icon: Radio },
  { key: 'video', zh: '视频', en: 'Video', icon: TrendingUp },
  { key: 'subscribed', zh: '已订阅', en: 'Subscribed', icon: TrendingUp },
]

const DEFAULT_GROUP: PlatformGroup = 'dev'

const DEFAULT_ORDER = PLATFORM_CONFIGS.map(c => c.id)

function mergeOrder(saved: TrendsLayout): string[] {
  const knownSet = new Set(ALL_PLATFORMS as readonly string[])
  // Start with saved order, then append any known platforms not yet in it
  let order = saved.order.length > 0 ? [...saved.order] : [...DEFAULT_ORDER]
  // Add known platforms that aren't in saved order yet
  for (const pid of DEFAULT_ORDER) {
    if (!order.includes(pid) && !saved.hidden.includes(pid)) {
      order.push(pid)
    }
  }
  // Add custom platforms
  for (const pid of saved.custom) {
    if (!order.includes(pid)) order.push(pid)
  }
  // Remove hidden
  return order.filter(p => !saved.hidden.includes(p))
}

// ─── Main page ──────────────────────────────────────────────────────────────────

const TrendsPage: FC = () => {
  const lang = useVmLang()

  const [group, setGroup] = useState<PlatformGroup>(DEFAULT_GROUP)
  const [results, setResults] = useState<Record<string, HotVideoPlatformResult>>({})
  const [loadingPlatforms, setLoadingPlatforms] = useState<Set<string>>(new Set())
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)

  // Subscription state (for "已订阅" tab and checkmarks)
  const [subscriptions, setMySubscriptions] = useState<Array<{ id: number; name: string; platforms: string[]; push_enabled: boolean; last_matched_at: string | null }>>([])
  const subscribedPlatformIds = new Set(subscriptions.flatMap(s => s.platforms.flatMap(p => p === 'all' ? [] : [p])))

  const loadSubscriptions = useCallback(async () => {
    try {
      const { listTrendSubscriptions } = await import('@/services/trendSubscription')
      const subs = await listTrendSubscriptions()
      setMySubscriptions(subs)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadSubscriptions() }, [loadSubscriptions])

  // Layout state
  const [layout, setLayout] = useState<TrendsLayout>(loadLayout)
  const [visibleOrder, setVisibleOrder] = useState<string[]>(() => mergeOrder(loadLayout()))
  const [customInput, setCustomInput] = useState('')
  const [showPlatformPicker, setShowPlatformPicker] = useState(false)

  // Drag state
  const dragItem = useRef<string | null>(null)
  const dragOverItem = useRef<string | null>(null)

  // Persist layout changes
  const persist = useCallback((newLayout: TrendsLayout) => {
    setLayout(newLayout)
    saveLayout(newLayout)
    setVisibleOrder(mergeOrder(newLayout))
  }, [])

  // Filter by current tab
  const groupPlatformIds = PLATFORM_CONFIGS.filter(p => p.group.includes(group)).map(p => p.id)
  const activePlatforms = visibleOrder.filter(p => groupPlatformIds.includes(p as HotVideoItemPlatform))

  const fetchPlatform = useCallback(
    async (platformId: string, force = false) => {
      setLoadingPlatforms(prev => new Set([...prev, platformId]))
      try {
        const data = await listHotVideos(platformId as HotVideoItemPlatform, 20, force)
        const result = data.platforms?.[0]
        if (result) {
          setResults(prev => ({ ...prev, [platformId]: result }))
        }
      } catch {
        // silently keep old data
      } finally {
        setLoadingPlatforms(prev => {
          const next = new Set(prev)
          next.delete(platformId)
          return next
        })
      }
    },
    [],
  )

  const fetchAll = useCallback(
    async (platformIds: string[], force = false) => {
      await Promise.all(platformIds.map(pid => fetchPlatform(pid, force)))
      setRefreshedAt(new Date())
    },
    [fetchPlatform],
  )

  useEffect(() => {
    fetchAll(activePlatforms)
  }, [group, visibleOrder])

  // ─── Layout mutations ───────────────────────────────────────────────────────

  const handleTogglePlatform = (platformId: string) => {
    const newLayout = { ...layout }
    if (newLayout.hidden.includes(platformId)) {
      // Unhide — add back to order
      newLayout.hidden = newLayout.hidden.filter(p => p !== platformId)
      if (!newLayout.order.includes(platformId)) {
        newLayout.order.push(platformId)
      }
      persist(newLayout)
      fetchPlatform(platformId)
    } else {
      // Hide — remove from order
      newLayout.hidden = [...newLayout.hidden, platformId]
      newLayout.order = newLayout.order.filter(p => p !== platformId)
      persist(newLayout)
      setResults(prev => { const n = { ...prev }; delete n[platformId]; return n })
    }
  }

  const handleToggleAllInGroup = (groupKey: PlatformGroup, visible: boolean) => {
    const groupIds = PLATFORM_CONFIGS.filter(p => p.group.includes(groupKey)).map(p => p.id)
    const newLayout = { ...layout }
    if (visible) {
      newLayout.hidden = newLayout.hidden.filter(p => !groupIds.includes(p))
      for (const pid of groupIds) {
        if (!newLayout.order.includes(pid)) newLayout.order.push(pid)
      }
    } else {
      newLayout.hidden = [...new Set([...newLayout.hidden, ...groupIds])]
      newLayout.order = newLayout.order.filter(p => !groupIds.includes(p))
    }
    persist(newLayout)
    // refetch if unhiding
    if (visible) fetchAll(groupIds)
  }

  const handleAddCustom = () => {
    const ids = customInput.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean)
    if (ids.length === 0) return
    const newLayout = { ...layout, custom: [...new Set([...layout.custom, ...ids])] }
    for (const id of ids) {
      if (!newLayout.order.includes(id)) newLayout.order.push(id)
      newLayout.hidden = newLayout.hidden.filter(p => p !== id)
    }
    persist(newLayout)
    setCustomInput('')
    toast.success(lang === 'zh' ? `已添加 ${ids.length} 个平台` : `Added ${ids.length} platforms`)
    fetchAll(ids)
  }

  // ─── Drag & drop ────────────────────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, platformId: string) => {
    dragItem.current = platformId
    e.dataTransfer.effectAllowed = 'move'
    ;(e.currentTarget as HTMLElement).classList.add('vm-dragging')
  }

  const handleDragEnd = (e: React.DragEvent) => {
    ;(e.currentTarget as HTMLElement).classList.remove('vm-dragging')
    dragItem.current = null
    dragOverItem.current = null
  }

  const handleDragOver = (e: React.DragEvent, platformId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    dragOverItem.current = platformId
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const from = dragItem.current
    const to = dragOverItem.current
    if (!from || !to || from === to) return

    const newOrder = [...visibleOrder]
    const fromIdx = newOrder.indexOf(from)
    const toIdx = newOrder.indexOf(to)
    if (fromIdx < 0 || toIdx < 0) return

    newOrder.splice(fromIdx, 1)
    newOrder.splice(toIdx, 0, from)

    const newLayout = { ...layout, order: newOrder }
    persist(newLayout)
  }

  // ─── Quick subscribe from radar card ──────────────────────────────────────────

  const handleSubscribe = async (platformId: string) => {
    const brand = PLATFORMS[platformId] || { zh: platformId, en: platformId }
    const name = lang === 'zh' ? `${brand.zh} 热点` : `${brand.en} Hot`
    try {
      // Get existing enabled channels to auto-assign
      let channelIds: number[] = []
      try {
        const channels = await listNotificationChannels()
        channelIds = channels.filter(c => c.enabled).map(c => c.id)
      } catch { /* no channels yet */ }

      // Create subscription with empty keywords = match all items
      const sub = await createTrendSubscription({
        name,
        keywords: [],
        platforms: [platformId],
        push_enabled: channelIds.length > 0,
        push_channel_ids: channelIds,
      })

      // Immediately trigger matching
      let matchResult: { new_matches: number } | null = null
      try {
        matchResult = await triggerMatch(sub.id)
      } catch { /* match failed but subscription created */ }

      const matched = matchResult?.new_matches ?? 0
      toast.success(
        lang === 'zh'
          ? `已创建「${name}」订阅，匹配到 ${matched} 条热点${channelIds.length > 0 ? '，已推送' : ''}`
          : `Created "${name}" — ${matched} items matched${channelIds.length > 0 ? ', pushed' : ''}`,
        { duration: 4000 },
      )
      loadSubscriptions() // refresh subscribed list
    } catch {
      toast.error(lang === 'zh' ? '创建订阅失败' : 'Failed to create subscription')
    }
  }

  // ─── Item selection ─────────────────────────────────────────────────────────

  const handleSelect = (item: HotVideoItem) => {
    if (item.url) window.open(item.url, '_blank')
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="vm-trends-page">
      {/* Header — tabs + actions in one row */}
      <div className="vm-trends-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 22px' }}>
        <div className="vm-trends-tabs" style={{ margin: 0 }}>
          {GROUPS.map(g => (
            <button
              key={g.key}
              className={'vm-trends-tab' + (group === g.key ? ' active' : '')}
              onClick={() => setGroup(g.key)}
            >
              {g[lang]}
            </button>
          ))}
        </div>
        <div className="vm-trends-meta" style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {refreshedAt && (
            <span className="vm-trends-timestamp" style={{ fontSize: 11 }}>
              {new Date(refreshedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <div style={{ position: 'relative' }}>
            <button
              className="vm-btn vm-btn-outline vm-btn-sm"
              onClick={() => setShowPlatformPicker(v => !v)}
            >
              <Plus size={14} />
              {lang === 'zh' ? '平台' : 'Platforms'}
            </button>
            {showPlatformPicker && (
              <>
                <div className="vm-trend-menu-backdrop" onClick={() => setShowPlatformPicker(false)} />
                <PlatformPicker
                  layout={layout}
                  customInput={customInput}
                  setCustomInput={setCustomInput}
                  onToggle={handleTogglePlatform}
                  onToggleGroup={handleToggleAllInGroup}
                  onAddCustom={handleAddCustom}
                  onClose={() => setShowPlatformPicker(false)}
                />
              </>
            )}
          </div>
          <button
            className="vm-btn vm-btn-ghost vm-btn-sm"
            onClick={() => fetchAll(activePlatforms, true)}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Platform grid / Subscribed tab */}
      {group === 'subscribed' ? (
        <div className="vm-trends-grid">
          {subscriptions.length === 0 ? (
            <div className="vm-empty" style={{ gridColumn: '1 / -1' }}>
              <Bell size={32} className="vm-muted" />
              <p>{lang === 'zh' ? '还没有订阅任何平台' : 'No platform subscriptions'}</p>
              <p className="vm-faint">{lang === 'zh' ? '在任意平台卡片 ⋯ 菜单中点击「订阅此平台」' : 'Click "Subscribe" in any platform card menu'}</p>
            </div>
          ) : (
            subscriptions.map(sub => (
              <div key={sub.id} className="vm-card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Bell size={16} className="vm-accent" />
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{sub.name}</span>
                  </div>
                  <span className="vm-chip" style={{ fontSize: 10 }}>
                    {sub.push_enabled ? '🔔 推送中' : '推送关闭'}
                  </span>
                </div>
                <div className="vm-faint" style={{ fontSize: 11 }}>
                  {lang === 'zh' ? '监控平台：' : 'Platforms: '}
                  {sub.platforms.filter(p => p !== 'all').slice(0, 4).map(p => {
                    const brand = PLATFORMS[p] || { zh: p, en: p, short: '?', color: '#94a3b8' }
                    return <span key={p} className="vm-chip" style={{ fontSize: 10, marginRight: 3 }}>{brand.zh || p}</span>
                  })}
                  {sub.platforms.length > 4 && <span className="vm-faint"> +{sub.platforms.length - 4}</span>}
                </div>
                <div className="vm-faint" style={{ fontSize: 11, display: 'flex', gap: 16 }}>
                  {sub.last_matched_at ? (
                    <span>{lang === 'zh' ? '上次推送：' : 'Last push: '}{new Date(sub.last_matched_at).toLocaleString()}</span>
                  ) : (
                    <span>{lang === 'zh' ? '尚未推送' : 'Not pushed yet'}</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="vm-trends-grid">
          {activePlatforms.map(platformId => (
            <PlatformCard
              key={platformId}
              platformId={platformId}
              result={results[platformId]}
              loading={loadingPlatforms.has(platformId)}
              onSelect={handleSelect}
              onRefresh={() => fetchPlatform(platformId, true)}
              onToggle={() => handleTogglePlatform(platformId)}
              onSubscribe={() => handleSubscribe(platformId)}
              isSubscribed={subscribedPlatformIds.has(platformId)}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Platform picker popover ────────────────────────────────────────────────────

interface PlatformPickerProps {
  layout: TrendsLayout
  customInput: string
  setCustomInput: (v: string) => void
  onToggle: (platformId: string) => void
  onToggleGroup: (group: PlatformGroup, visible: boolean) => void
  onAddCustom: () => void
  onClose: () => void
}

const PlatformPicker: FC<PlatformPickerProps> = ({
  layout, customInput, setCustomInput, onToggle, onToggleGroup, onAddCustom, onClose,
}) => {
  const lang = useVmLang()

  return (
    <div className="vm-platform-picker">
      <div className="vm-platform-picker-head">
        <span style={{ fontWeight: 700, fontSize: 13 }}>
          {lang === 'zh' ? '选择展示的平台' : 'Choose platforms'}
        </span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            className="vm-btn vm-btn-ghost vm-btn-sm"
            style={{ fontSize: 11 }}
            onClick={() => GROUPS.forEach(g => onToggleGroup(g.key, true))}
          >
            {lang === 'zh' ? '全选' : 'All'}
          </button>
          <button
            className="vm-btn vm-btn-ghost vm-btn-sm"
            style={{ fontSize: 11 }}
            onClick={() => GROUPS.forEach(g => onToggleGroup(g.key, false))}
          >
            {lang === 'zh' ? '全不选' : 'None'}
          </button>
          <button className="vm-btn vm-btn-ghost vm-btn-sm" style={{ padding: 2 }} onClick={onClose}>
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="vm-platform-picker-body">
        {GROUPS.map(g => {
          const groupIds = PLATFORM_CONFIGS.filter(p => p.group.includes(g.key)).map(p => p.id)
          const visibleCount = groupIds.filter(id => !layout.hidden.includes(id)).length
          const allVisible = visibleCount === groupIds.length
          return (
            <div key={g.key} className="vm-platform-picker-group">
              <div className="vm-platform-picker-group-head">
                <label className="vm-check-label" style={{ fontWeight: 600, fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={allVisible}
                    ref={el => { if (el) el.indeterminate = visibleCount > 0 && !allVisible }}
                    onChange={() => onToggleGroup(g.key, !allVisible)}
                  />
                  <span>{g[lang]} ({visibleCount}/{groupIds.length})</span>
                </label>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                {groupIds.map(pid => {
                  const brand = PLATFORMS[pid] || { zh: pid, en: pid, short: '?', color: '#94a3b8' }
                  const checked = !layout.hidden.includes(pid)
                  return (
                    <label
                      key={pid}
                      className={'vm-chip' + (checked ? ' active' : '')}
                      style={checked ? { borderColor: brand.color, background: brand.color + '18' } : { cursor: 'pointer' }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggle(pid)}
                        style={{ display: 'none' }}
                      />
                      <span className="vm-chk" style={checked ? { background: brand.color } : {}}>
                        {checked ? <span style={{ color: '#fff', fontSize: 10, lineHeight: 1 }}>✓</span> : null}
                      </span>
                      {brand[lang]}
                    </label>
                  )
                })}
              </div>
            </div>
          )
        })}

        {/* Custom platforms */}
        {layout.custom.length > 0 && (
          <div className="vm-platform-picker-group">
            <div className="vm-platform-picker-group-head" style={{ fontWeight: 600, fontSize: 12, color: 'var(--vm-muted)' }}>
              {lang === 'zh' ? '自定义平台' : 'Custom'}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              {layout.custom.map(pid => {
                const checked = !layout.hidden.includes(pid)
                return (
                  <label
                    key={pid}
                    className={'vm-chip' + (checked ? ' active' : '')}
                    style={{ cursor: 'pointer' }}
                  >
                    <input type="checkbox" checked={checked} onChange={() => onToggle(pid)} style={{ display: 'none' }} />
                    <span className="vm-chk" style={checked ? { background: '#94a3b8' } : {}}>
                      {checked ? <span style={{ color: '#fff', fontSize: 10, lineHeight: 1 }}>✓</span> : null}
                    </span>
                    {pid}
                  </label>
                )
              })}
            </div>
          </div>
        )}

        {/* Add custom input */}
        <div style={{ borderTop: '1px solid var(--vm-border)', paddingTop: 10, marginTop: 4 }}>
          <label className="vm-faint" style={{ fontSize: 11 }}>
            {lang === 'zh' ? '添加自定义平台 ID' : 'Add custom platform ID'}
          </label>
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <input
              className="vm-input"
              value={customInput}
              onChange={e => setCustomInput(e.target.value)}
              placeholder="newsnow-id, another-id…"
              style={{ flex: 1, fontSize: 12 }}
              onKeyDown={e => { if (e.key === 'Enter') onAddCustom() }}
            />
            <button className="vm-btn vm-btn-primary vm-btn-sm" onClick={onAddCustom}>
              {lang === 'zh' ? '添加' : 'Add'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Platform card ──────────────────────────────────────────────────────────────

interface PlatformCardProps {
  platformId: string
  result?: HotVideoPlatformResult
  loading: boolean
  onSelect: (item: HotVideoItem) => void
  onRefresh: () => void
  onToggle: () => void
  onSubscribe: () => void
  isSubscribed: boolean
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragEnd: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent, id: string) => void
  onDrop: (e: React.DragEvent) => void
}

const PlatformCard: FC<PlatformCardProps> = ({
  platformId, result, loading, onSelect, onRefresh, onToggle, onSubscribe, isSubscribed,
  onDragStart, onDragEnd, onDragOver, onDrop,
}) => {
  const lang = useVmLang()
  const brand = PLATFORMS[platformId] || { zh: platformId, en: platformId, short: '?', color: '#94a3b8' }
  const items = result?.status === 'ok' ? result.items : []
  const isArticle = isArticlePlatform(platformId as HotVideoItemPlatform)
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div
      className="vm-trend-card"
      draggable
      onDragStart={e => onDragStart(e, platformId)}
      onDragEnd={onDragEnd}
      onDragOver={e => onDragOver(e, platformId)}
      onDrop={onDrop}
    >
      {/* Card header */}
      <div className="vm-trend-card-head" style={{ borderLeftColor: brand.color }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            className="vm-trend-drag-handle"
            title={lang === 'zh' ? '拖拽排序' : 'Drag to reorder'}
            style={{ cursor: 'grab', display: 'flex', opacity: 0.4 }}
          >
            <GripVertical size={14} />
          </span>
          <div className="vm-trend-card-title">
            <Pf id={platformId} sm />
            <span>{brand[lang]}</span>
            {isArticle && (
              <span className="vm-trend-badge-article">{lang === 'zh' ? '资讯' : 'News'}</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button
            className="vm-btn vm-btn-ghost vm-btn-sm"
            style={{ width: 28, paddingInline: 0 }}
            onClick={onRefresh}
            disabled={loading}
            title={lang === 'zh' ? '刷新' : 'Refresh'}
          >
            <RefreshCw size={12} className={loading ? 'vm-spin' : ''} />
          </button>
          {/* Three-dot menu */}
          <div style={{ position: 'relative' }}>
            <button
              className="vm-btn vm-btn-ghost vm-btn-sm"
              style={{ width: 22, paddingInline: 0 }}
              onClick={() => setMenuOpen(v => !v)}
              title={lang === 'zh' ? '更多' : 'More'}
            >
              <MoreHorizontal size={14} />
            </button>
            {menuOpen && (
              <>
                <div
                  className="vm-trend-menu-backdrop"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="vm-trend-menu">
                  <button
                    className="vm-trend-menu-item"
                    onClick={() => { setMenuOpen(false); if (!isSubscribed) onSubscribe() }}
                    style={isSubscribed ? { color: 'var(--vm-accent)' } : undefined}
                  >
                    {isSubscribed ? <Check size={12} /> : <BellPlus size={12} />}
                    {isSubscribed
                      ? (lang === 'zh' ? '已订阅' : 'Subscribed')
                      : (lang === 'zh' ? '订阅此平台' : 'Subscribe')}
                  </button>
                  <button
                    className="vm-trend-menu-item"
                    onClick={() => { setMenuOpen(false); onToggle() }}
                  >
                    <X size={12} />
                    {lang === 'zh' ? '隐藏此卡片' : 'Hide card'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Card body */}
      <div className="vm-trend-card-body">
        {loading && items.length === 0 ? (
          <div className="vm-trend-loading">
            <Loader2 size={18} className="vm-spin" />
            <span>{lang === 'zh' ? '加载中...' : 'Loading...'}</span>
          </div>
        ) : result?.status === 'error' || result?.status === 'unavailable' ? (
          <div className="vm-trend-error">
            <AlertCircle size={14} />
            <span>{result.message || (lang === 'zh' ? '暂时无法获取' : 'Unavailable')}</span>
          </div>
        ) : items.length === 0 ? (
          <div className="vm-trend-empty">
            {lang === 'zh' ? '暂无数据' : 'No data'}
          </div>
        ) : (
          <ol className="vm-trend-list">
            {items.slice(0, 15).map((item, idx) => (
              <TrendItem
                key={`${item.id}-${idx}`}
                item={item}
                rank={idx + 1}
                onSelect={onSelect}
              />
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

// ─── Trend item ─────────────────────────────────────────────────────────────────

const TrendItem: FC<{
  item: HotVideoItem
  rank: number
  onSelect: (item: HotVideoItem) => void
}> = ({ item, rank, onSelect }) => {
  const isHot = rank <= 3

  return (
    <li className="vm-trend-item">
      <span
        className={'vm-trend-rank' + (isHot ? ' hot' : '')}
        style={isHot ? { color: rank === 1 ? '#EF4444' : rank === 2 ? '#F97316' : '#EAB308' } : {}}
      >
        {rank}
      </span>
      <button
        className="vm-trend-item-title"
        onClick={() => onSelect(item)}
        title={item.title}
      >
        {item.title}
      </button>
      {item.hot_score && (
        <span className="vm-trend-score">{item.hot_score}</span>
      )}
      {item.url && (
        <a
          className="vm-trend-ext"
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          title={item.title}
        >
          <ExternalLink size={11} />
        </a>
      )}
    </li>
  )
}

export default TrendsPage
