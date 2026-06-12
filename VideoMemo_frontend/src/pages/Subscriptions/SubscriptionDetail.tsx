import { FC, useCallback, useEffect, useState } from 'react'
import { ExternalLink, EyeOff, Loader2 } from 'lucide-react'
import { useVmLang } from '@/i18n/redesign'
import { PLATFORMS, Pf } from '@/components/design/PlatformAvatar'
import { listMatches, markMatchesRead, type TrendSubscriptionMatch } from '@/services/trendSubscription'
import type { HotVideoItemPlatform } from '@/services/hotVideos'

interface Props {
  subscriptionId: number
  onSelectItem: (match: TrendSubscriptionMatch) => void
}

const SubscriptionDetail: FC<Props> = ({ subscriptionId, onSelectItem }) => {
  const lang = useVmLang()
  const [matches, setMatches] = useState<TrendSubscriptionMatch[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listMatches(subscriptionId, 100)
      setMatches(data)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [subscriptionId])

  useEffect(() => {
    reload()
  }, [reload])

  const handleMarkRead = async () => {
    try {
      await markMatchesRead(subscriptionId)
      setMatches(prev => prev.map(m => ({ ...m, is_read: true })))
    } catch {
      // silent
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="vm-spin" size={16} />
        <span className="ml-2 vm-faint" style={{ fontSize: 13 }}>{lang === 'zh' ? '加载匹配结果...' : 'Loading matches...'}</span>
      </div>
    )
  }

  if (matches.length === 0) {
    return (
      <div className="py-6 text-center vm-faint" style={{ fontSize: 13 }}>
        {lang === 'zh' ? '暂无匹配结果，点击上方播放按钮立即匹配' : 'No matches yet. Click the play button to match now.'}
      </div>
    )
  }

  const unreadCount = matches.filter(m => !m.is_read).length

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="vm-faint" style={{ fontSize: 12 }}>
          {lang === 'zh' ? `共 ${matches.length} 条匹配` : `${matches.length} matches`}
          {unreadCount > 0 && (
            <span style={{ marginLeft: 8, color: 'var(--vm-primary)' }}>
              {lang === 'zh' ? `${unreadCount} 条未读` : `${unreadCount} unread`}
            </span>
          )}
        </span>
        {unreadCount > 0 && (
          <button className="vm-btn vm-btn-ghost vm-btn-sm" style={{ fontSize: 11 }} onClick={handleMarkRead}>
            <EyeOff size={12} />
            {lang === 'zh' ? '全部已读' : 'Mark all read'}
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 400, overflowY: 'auto' }}>
        {matches.map(match => {
          const brand = PLATFORMS[match.platform] || { zh: match.platform, en: match.platform, short: '?', color: '#94a3b8' }
          return (
            <div
              key={match.id}
              className="vm-trend-item"
              style={{
                opacity: match.is_read ? 0.6 : 1,
                padding: '6px 8px',
                borderRadius: 6,
                background: match.is_read ? 'transparent' : 'var(--vm-surface-2)',
              }}
            >
              <Pf id={match.platform as HotVideoItemPlatform} sm />
              <button
                className="vm-trend-item-title"
                onClick={() => onSelectItem(match)}
                title={match.title}
                style={{ textAlign: 'left' }}
              >
                {match.title}
              </button>
              {match.hot_score && (
                <span className="vm-trend-score" style={{ fontSize: 10 }}>{match.hot_score}</span>
              )}
              {match.url && (
                <a
                  className="vm-trend-ext"
                  href={match.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  title={match.title}
                >
                  <ExternalLink size={11} />
                </a>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default SubscriptionDetail
