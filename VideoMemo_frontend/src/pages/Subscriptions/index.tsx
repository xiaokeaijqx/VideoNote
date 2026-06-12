import { FC, useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Bell, Loader2, Pencil, Plus, Power, PowerOff, Rss, Trash2, Play, ExternalLink, Eye, EyeOff, HelpCircle } from 'lucide-react'
import { useVmLang } from '@/i18n/redesign'
import { PLATFORMS, Pf } from '@/components/design/PlatformAvatar'
import {
  listTrendSubscriptions,
  createTrendSubscription,
  updateTrendSubscription,
  deleteTrendSubscription,
  triggerMatch,
  triggerMatchAll,
  listMatches,
  markMatchesRead,
  listNotificationChannels,
  createNotificationChannel,
  updateNotificationChannel,
  deleteNotificationChannel,
  testNotificationChannel,
  listAllMatches,
  type TrendSubscription,
  type TrendSubscriptionMatch,
  type NotificationChannel,
  type MatchResult,
} from '@/services/trendSubscription'
import type { HotVideoItemPlatform } from '@/services/hotVideos'
import SubscriptionDetail from './SubscriptionDetail'

// ─── Platform groups for the multi-select ───────────────────────────────────────

const PLATFORM_GROUPS: Array<{ labelZh: string; labelEn: string; platforms: HotVideoItemPlatform[] }> = [
  {
    labelZh: '视频平台', labelEn: 'Video',
    platforms: ['bilibili', 'bilibili-hot-search', 'douyin', 'youtube', 'kuaishou', 'xiaohongshu'],
  },
  {
    labelZh: '资讯平台', labelEn: 'News',
    platforms: [
      'weibo', 'zhihu', 'baidu', 'toutiao', 'thepaper', 'ifeng',
      'tieba', 'hupu', 'tencent',
      'cankaoxiaoxi', 'zaobao', 'douban',
    ],
  },
  {
    labelZh: '财经平台', labelEn: 'Finance',
    platforms: [
      'wallstreetcn', 'wallstreetcn-hot', 'wallstreetcn-news', 'wallstreetcn-quick',
      'cls', 'cls-hot', 'cls-telegraph', 'cls-depth',
      '36kr', '36kr-quick', '36kr-renqi',
      'jin10', 'xueqiu', 'xueqiu-hotstock', 'gelonghui',
    ],
  },
  {
    labelZh: '科技平台', labelEn: 'Tech',
    platforms: [
      'github', 'github-trending-today', 'hackernews',
      'v2ex', 'v2ex-share', 'producthunt',
      'juejin', 'ithome', 'sspai', 'solidot', 'coolapk',
    ],
  },
]

const ALL_PLATFORMS: HotVideoItemPlatform[] = PLATFORM_GROUPS.flatMap(g => g.platforms)

// ─── Main page ──────────────────────────────────────────────────────────────────

type TabKey = 'subscriptions' | 'channels'

const SubscriptionsPage: FC = () => {
  const lang = useVmLang()
  const [tab, setTab] = useState<TabKey>('subscriptions')
  const [subscriptions, setSubscriptions] = useState<TrendSubscription[]>([])
  const [channels, setChannels] = useState<NotificationChannel[]>([])
  const [loading, setLoading] = useState(true)
  const [matchingId, setMatchingId] = useState<number | null>(null)
  const [matchAllRunning, setMatchAllRunning] = useState(false)
  const [expandedSubId, setExpandedSubId] = useState<number | null>(null)
  const [recentMatches, setRecentMatches] = useState<Record<number, TrendSubscriptionMatch[]>>({})
  const [showSubForm, setShowSubForm] = useState(false)
  const [showChannelForm, setShowChannelForm] = useState(false)
  const [editSubId, setEditSubId] = useState<number | null>(null)
  const [editChannelId, setEditChannelId] = useState<number | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formKeywords, setFormKeywords] = useState('')
  const [formPlatforms, setFormPlatforms] = useState<Set<string>>(new Set(ALL_PLATFORMS))
  const [formCustomPlatforms, setFormCustomPlatforms] = useState('')
  const [formMatchMode, setFormMatchMode] = useState<'any' | 'all'>('any')
  const [formPushEnabled, setFormPushEnabled] = useState(false)
  const [formPushChannelIds, setFormPushChannelIds] = useState<number[]>([])
  const [formChannelName, setFormChannelName] = useState('')
  const [formChannelType, setFormChannelType] = useState<string>('webhook')
  const [formChannelConfig, setFormChannelConfig] = useState('{}')
  // Channel-specific form fields (better UX than raw JSON)
  const [emailAddress, setEmailAddress] = useState('')
  const [emailAuthCode, setEmailAuthCode] = useState('')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [barkDeviceKey, setBarkDeviceKey] = useState('')
  const [barkServerUrl, setBarkServerUrl] = useState('https://api.day.app/push')

  const reloadSubs = useCallback(async () => {
    try {
      const subs = await listTrendSubscriptions()
      setSubscriptions(subs)
      // Fetch recent matches for all subs in parallel (last 5 per sub)
      const matchMap: Record<number, TrendSubscriptionMatch[]> = {}
      await Promise.all(
        subs.map(async sub => {
          try {
            matchMap[sub.id] = await listMatches(sub.id, 5)
          } catch {
            matchMap[sub.id] = []
          }
        }),
      )
      setRecentMatches(matchMap)
    } catch {
      toast.error(lang === 'zh' ? '加载订阅失败' : 'Failed to load subscriptions')
    }
  }, [lang])

  const reloadChannels = useCallback(async () => {
    try {
      const chs = await listNotificationChannels()
      setChannels(chs)
    } catch {
      toast.error(lang === 'zh' ? '加载通知通道失败' : 'Failed to load channels')
    }
  }, [lang])

  useEffect(() => {
    setLoading(true)
    Promise.all([reloadSubs(), reloadChannels()]).finally(() => setLoading(false))
  }, [reloadSubs, reloadChannels])

  // ─── Subscription CRUD handlers ──────────────────────────────────────────────

  const handleCreateSub = async () => {
    if (!formName.trim() || !formKeywords.trim()) {
      toast.error(lang === 'zh' ? '请填写名称和关键词' : 'Name and keywords required')
      return
    }
    const customIds = formCustomPlatforms.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean)
    const platforms = formPlatforms.has('all')
      ? ['all']
      : [...Array.from(formPlatforms), ...customIds]
    try {
      await createTrendSubscription({
        name: formName.trim(),
        keywords: formKeywords.split(/[,，\s]+/).filter(Boolean),
        platforms,
        match_mode: formMatchMode,
        push_enabled: formPushEnabled,
        push_channel_ids: formPushChannelIds,
      })
      toast.success(lang === 'zh' ? '订阅已创建' : 'Subscription created')
      setShowSubForm(false)
      resetSubForm()
      await reloadSubs()
    } catch {
      toast.error(lang === 'zh' ? '创建失败' : 'Create failed')
    }
  }

  const handleUpdateSub = async () => {
    if (editSubId === null || !formName.trim() || !formKeywords.trim()) {
      toast.error(lang === 'zh' ? '请填写名称和关键词' : 'Name and keywords required')
      return
    }
    const customIds = formCustomPlatforms.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean)
    const platforms = formPlatforms.has('all')
      ? ['all']
      : [...Array.from(formPlatforms), ...customIds]
    try {
      await updateTrendSubscription(editSubId, {
        name: formName.trim(),
        keywords: formKeywords.split(/[,，\s]+/).filter(Boolean),
        platforms,
        match_mode: formMatchMode,
        push_enabled: formPushEnabled,
        push_channel_ids: formPushChannelIds,
      })
      toast.success(lang === 'zh' ? '订阅已更新' : 'Subscription updated')
      setShowSubForm(false)
      setEditSubId(null)
      resetSubForm()
      await reloadSubs()
    } catch {
      toast.error(lang === 'zh' ? '更新失败' : 'Update failed')
    }
  }

  const handleDeleteSub = async (id: number) => {
    if (!confirm(lang === 'zh' ? '确定删除此订阅？相关匹配记录也会被删除。' : 'Delete this subscription and its matches?')) return
    try {
      await deleteTrendSubscription(id)
      toast.success(lang === 'zh' ? '已删除' : 'Deleted')
      await reloadSubs()
    } catch {
      toast.error(lang === 'zh' ? '删除失败' : 'Delete failed')
    }
  }

  const handleToggleSub = async (sub: TrendSubscription) => {
    try {
      await updateTrendSubscription(sub.id, { enabled: !sub.enabled })
      await reloadSubs()
    } catch {
      toast.error(lang === 'zh' ? '操作失败' : 'Toggle failed')
    }
  }

  const handleMatch = async (id: number) => {
    setMatchingId(id)
    try {
      const result = await triggerMatch(id)
      if (result.new_matches > 0) {
        toast.success(
          lang === 'zh'
            ? `匹配完成，发现 ${result.new_matches} 条新热点`
            : `Matched ${result.new_matches} new items`,
        )
      } else {
        toast.success(lang === 'zh' ? '没有发现新匹配' : 'No new matches')
      }
      await reloadSubs()
      // Auto-expand to show results
      setExpandedSubId(id)
    } catch {
      toast.error(lang === 'zh' ? '匹配失败' : 'Match failed')
    } finally {
      setMatchingId(null)
    }
  }

  const handleMatchAll = async () => {
    setMatchAllRunning(true)
    try {
      const summary = await triggerMatchAll()
      if (summary.total_new_matches > 0) {
        toast.success(
          lang === 'zh'
            ? `全部匹配完成，${summary.total_subscriptions} 个订阅共发现 ${summary.total_new_matches} 条新热点`
            : `All matched: ${summary.total_new_matches} new across ${summary.total_subscriptions} subscriptions`,
        )
      } else {
        toast.success(lang === 'zh' ? '没有发现新匹配' : 'No new matches found')
      }
      await reloadSubs()
    } catch {
      toast.error(lang === 'zh' ? '匹配失败' : 'Match all failed')
    } finally {
      setMatchAllRunning(false)
    }
  }

  const handleSelectItem = (match: TrendSubscriptionMatch) => {
    if (match.url) window.open(match.url, '_blank')
  }

  // ─── Email SMTP auto-detect ───────────────────────────────────────────────────

  const EMAIL_PROVIDERS: Record<string, { host: string; port: number; name: string }> = {
    'qq.com': { host: 'smtp.qq.com', port: 587, name: 'QQ邮箱' },
    'vip.qq.com': { host: 'smtp.qq.com', port: 587, name: 'QQ邮箱' },
    'foxmail.com': { host: 'smtp.qq.com', port: 587, name: 'QQ邮箱' },
    '163.com': { host: 'smtp.163.com', port: 587, name: '163邮箱' },
    '126.com': { host: 'smtp.126.com', port: 587, name: '126邮箱' },
    'gmail.com': { host: 'smtp.gmail.com', port: 587, name: 'Gmail' },
    'outlook.com': { host: 'smtp-mail.outlook.com', port: 587, name: 'Outlook' },
    'hotmail.com': { host: 'smtp-mail.outlook.com', port: 587, name: 'Outlook' },
    'live.com': { host: 'smtp-mail.outlook.com', port: 587, name: 'Outlook' },
    'icloud.com': { host: 'smtp.mail.me.com', port: 587, name: 'iCloud' },
    'me.com': { host: 'smtp.mail.me.com', port: 587, name: 'iCloud' },
    'yeah.net': { host: 'smtp.yeah.net', port: 587, name: 'Yeah邮箱' },
    'sina.com': { host: 'smtp.sina.com', port: 587, name: '新浪邮箱' },
    'sohu.com': { host: 'smtp.sohu.com', port: 587, name: '搜狐邮箱' },
  }

  function detectEmailProvider(email: string): { host: string; port: number; name: string } | null {
    const domain = email.split('@')[1]?.toLowerCase()
    if (!domain) return null
    return EMAIL_PROVIDERS[domain] || null
  }

  function buildEmailConfig(): Record<string, unknown> {
    return {
      smtp_host: detectEmailProvider(emailAddress)?.host || '',
      smtp_port: detectEmailProvider(emailAddress)?.port || 587,
      smtp_user: emailAddress,
      smtp_password: emailAuthCode,
      to: emailAddress,
    }
  }

  // ─── Channel CRUD handlers ───────────────────────────────────────────────────

  const handleCreateChannel = async () => {
    if (!formChannelName.trim()) {
      toast.error(lang === 'zh' ? '请填写通道名称' : 'Name required')
      return
    }
    let config: Record<string, unknown> = {}
    if (formChannelType === 'webhook') {
      if (!webhookUrl.trim()) { toast.error(lang === 'zh' ? '请填写 Webhook URL' : 'Webhook URL required'); return }
      config = { url: webhookUrl.trim() }
    } else if (formChannelType === 'bark') {
      if (!barkDeviceKey.trim()) { toast.error(lang === 'zh' ? '请填写 Device Key' : 'Device Key required'); return }
      config = { device_key: barkDeviceKey.trim(), url: barkServerUrl.trim() || 'https://api.day.app/push' }
    } else if (formChannelType === 'email') {
      if (!emailAddress.trim() || !emailAuthCode.trim()) {
        toast.error(lang === 'zh' ? '请填写邮箱地址和授权码' : 'Email and auth code required'); return
      }
      config = buildEmailConfig()
    }
    try {
      await createNotificationChannel({ name: formChannelName.trim(), type: formChannelType, config })
      toast.success(lang === 'zh' ? '通知通道已创建' : 'Channel created')
      setShowChannelForm(false)
      resetChannelForm()
      await reloadChannels()
    } catch {
      toast.error(lang === 'zh' ? '创建失败' : 'Create failed')
    }
  }

  const handleUpdateChannel = async () => {
    if (editChannelId === null || !formChannelName.trim()) {
      toast.error(lang === 'zh' ? '请填写通道名称' : 'Name required')
      return
    }
    let config: Record<string, unknown> = {}
    if (formChannelType === 'webhook') {
      if (!webhookUrl.trim()) { toast.error(lang === 'zh' ? '请填写 Webhook URL' : 'Webhook URL required'); return }
      config = { url: webhookUrl.trim() }
    } else if (formChannelType === 'bark') {
      if (!barkDeviceKey.trim()) { toast.error(lang === 'zh' ? '请填写 Device Key' : 'Device Key required'); return }
      config = { device_key: barkDeviceKey.trim(), url: barkServerUrl.trim() || 'https://api.day.app/push' }
    } else if (formChannelType === 'email') {
      if (!emailAddress.trim() || !emailAuthCode.trim()) {
        toast.error(lang === 'zh' ? '请填写邮箱地址和授权码' : 'Email and auth code required'); return
      }
      config = buildEmailConfig()
    }
    try {
      await updateNotificationChannel(editChannelId, { name: formChannelName.trim(), type: formChannelType, config })
      toast.success(lang === 'zh' ? '通知通道已更新' : 'Channel updated')
      setShowChannelForm(false)
      setEditChannelId(null)
      resetChannelForm()
      await reloadChannels()
    } catch {
      toast.error(lang === 'zh' ? '更新失败' : 'Update failed')
    }
  }

  const handleDeleteChannel = async (id: number) => {
    if (!confirm(lang === 'zh' ? '确定删除此通知通道？' : 'Delete this notification channel?')) return
    try {
      await deleteNotificationChannel(id)
      toast.success(lang === 'zh' ? '已删除' : 'Deleted')
      await reloadChannels()
    } catch {
      toast.error(lang === 'zh' ? '删除失败' : 'Delete failed')
    }
  }

  const handleTestChannel = async (id: number) => {
    try {
      await testNotificationChannel(id)
      toast.success(lang === 'zh' ? '测试通知已发送' : 'Test notification sent')
    } catch {
      toast.error(lang === 'zh' ? '发送失败，请检查配置' : 'Send failed, check config')
    }
  }

  const handleToggleChannel = async (ch: NotificationChannel) => {
    try {
      await updateNotificationChannel(ch.id, { enabled: !ch.enabled })
      await reloadChannels()
    } catch {
      toast.error(lang === 'zh' ? '操作失败' : 'Toggle failed')
    }
  }

  // ─── Form helpers ────────────────────────────────────────────────────────────

  const resetSubForm = () => {
    setFormName('')
    setFormKeywords('')
    setFormPlatforms(new Set(ALL_PLATFORMS))
    setFormCustomPlatforms('')
    setFormMatchMode('any')
    setFormPushEnabled(false)
    setFormPushChannelIds([])
  }

  const resetChannelForm = () => {
    setFormChannelName('')
    setFormChannelType('webhook')
    setFormChannelConfig('{}')
    setEmailAddress('')
    setEmailAuthCode('')
    setWebhookUrl('')
    setBarkDeviceKey('')
    setBarkServerUrl('https://api.day.app/push')
  }

  const openEditSub = (sub: TrendSubscription) => {
    setEditSubId(sub.id)
    setFormName(sub.name)
    setFormKeywords(sub.keywords.join(', '))
    // Separate known platforms from custom ones
    const knownIds = new Set(ALL_PLATFORMS)
    const subPlatforms = sub.platforms.includes('all') ? ['all'] : sub.platforms
    setFormPlatforms(new Set(subPlatforms.filter(p => p === 'all' || knownIds.has(p as HotVideoItemPlatform))))
    setFormCustomPlatforms(subPlatforms.filter(p => p !== 'all' && !knownIds.has(p as HotVideoItemPlatform)).join(', '))
    setFormMatchMode(sub.match_mode || 'any')
    setFormPushEnabled(sub.push_enabled)
    setFormPushChannelIds(sub.push_channel_ids || [])
    setShowSubForm(true)
  }

  const openEditChannel = (ch: NotificationChannel) => {
    setEditChannelId(ch.id)
    setFormChannelName(ch.name)
    setFormChannelType(ch.type)
    setFormChannelConfig(JSON.stringify(ch.config, null, 2))
    const cfg = ch.config as Record<string, unknown>
    if (ch.type === 'email') {
      setEmailAddress(String(cfg.smtp_user || cfg.to || ''))
      setEmailAuthCode(String(cfg.smtp_password || ''))
    } else if (ch.type === 'webhook') {
      setWebhookUrl(String(cfg.url || ''))
    } else if (ch.type === 'bark') {
      setBarkDeviceKey(String(cfg.device_key || ''))
      setBarkServerUrl(String(cfg.url || 'https://api.day.app/push'))
    }
    setShowChannelForm(true)
  }

  const togglePlatform = (p: string) => {
    setFormPlatforms(prev => {
      const next = new Set(prev)
      if (p === 'all') {
        if (next.has('all')) { next.delete('all'); return next }
        return new Set(['all'])
      }
      // uncheck "all" when picking individual platforms
      next.delete('all')
      if (next.has(p)) next.delete(p)
      else next.add(p)
      if (next.size === 0) return new Set(['all'])
      return next
    })
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  const TABS: Array<{ key: TabKey; zh: string; en: string }> = [
    { key: 'subscriptions', zh: '关键词订阅', en: 'Subscriptions' },
    { key: 'channels', zh: '通知通道', en: 'Channels' },
  ]

  if (loading) {
    return (
      <div className="vm-page vm-subscriptions-page">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="vm-spin" size={24} />
          <span className="ml-2 vm-muted">{lang === 'zh' ? '加载中...' : 'Loading...'}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="vm-page vm-subscriptions-page">
      {/* Header */}
      <div className="vm-page-header">
        <div className="vm-trends-tabs">
          {TABS.map(t => (
            <button
              key={t.key}
              className={'vm-trends-tab' + (tab === t.key ? ' active' : '')}
              onClick={() => setTab(t.key)}
            >
              {t[lang]}
            </button>
          ))}
        </div>
        <div className="vm-topbar-actions" style={{ marginTop: 0 }}>
          {tab === 'subscriptions' && (
            <>
              <button
                className="vm-btn vm-btn-outline vm-btn-sm"
                onClick={handleMatchAll}
                disabled={matchAllRunning || subscriptions.length === 0}
              >
                <Play size={14} className={matchAllRunning ? 'vm-spin' : ''} />
                {lang === 'zh' ? '全部匹配' : 'Match All'}
              </button>
              <button className="vm-btn vm-btn-primary vm-btn-sm" onClick={() => { resetSubForm(); setEditSubId(null); setShowSubForm(true) }}>
                <Plus size={14} />
                {lang === 'zh' ? '新建订阅' : 'New'}
              </button>
            </>
          )}
          {tab === 'channels' && (
            <button className="vm-btn vm-btn-primary vm-btn-sm" onClick={() => { resetChannelForm(); setEditChannelId(null); setShowChannelForm(true) }}>
              <Plus size={14} />
              {lang === 'zh' ? '新建通道' : 'New'}
            </button>
          )}
        </div>
      </div>

      {/* Subscription Form Modal */}
      {showSubForm && (
        <div className="vm-modal-overlay" onClick={() => { setShowSubForm(false); setEditSubId(null) }}>
          <div className="vm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="vm-modal-header">
              <h3>{editSubId !== null ? (lang === 'zh' ? '编辑订阅' : 'Edit Subscription') : (lang === 'zh' ? '新建订阅' : 'New Subscription')}</h3>
            </div>
            <div className="vm-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Name */}
              <div className="vm-field">
                <label className="vm-label">{lang === 'zh' ? '订阅名称' : 'Name'}</label>
                <input
                  className="vm-input"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder={lang === 'zh' ? '例如：AI 行业动态' : 'e.g. AI News'}
                />
              </div>
              {/* Keywords */}
              <div className="vm-field">
                <label className="vm-label">{lang === 'zh' ? '关键词（逗号分隔）' : 'Keywords (comma-separated)'}</label>
                <input
                  className="vm-input"
                  value={formKeywords}
                  onChange={e => setFormKeywords(e.target.value)}
                  placeholder={lang === 'zh' ? '例如：AI, OpenAI, ChatGPT, -广告' : 'e.g. AI, OpenAI, ChatGPT, -ad'}
                />
                <span className="vm-faint" style={{ fontSize: 11, marginTop: 4 }}>
                  {lang === 'zh' ? '支持 +必须匹配、-排除、/正则/' : 'Supports +required, -exclude, /regex/'}
                </span>
              </div>
              {/* Platforms */}
              <div className="vm-field">
                <label className="vm-label">{lang === 'zh' ? '监控平台' : 'Platforms'}</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                  <button
                    className={'vm-chip' + (formPlatforms.has('all') ? ' active' : '')}
                    onClick={() => togglePlatform('all')}
                  >
                    {lang === 'zh' ? '全部' : 'All'}
                  </button>
                  {PLATFORM_GROUPS.map(group => (
                    <div key={group.labelEn} style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 8, width: '100%' }}>
                      <span className="vm-faint" style={{ fontSize: 11, width: '100%', marginBottom: 2 }}>
                        {lang === 'zh' ? group.labelZh : group.labelEn}
                      </span>
                      {group.platforms.map(p => {
                        const brand = PLATFORMS[p] || { zh: p, en: p, short: '?', color: '#94a3b8' }
                        return (
                          <button
                            key={p}
                            className={'vm-chip' + (formPlatforms.has(p) ? ' active' : '')}
                            style={formPlatforms.has(p) ? { borderColor: brand.color, background: brand.color + '18' } : {}}
                            onClick={() => togglePlatform(p)}
                          >
                            {brand[lang]}
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>
                {/* Custom platform IDs */}
                <div style={{ marginTop: 8 }}>
                  <label className="vm-faint" style={{ fontSize: 11 }}>
                    {lang === 'zh' ? '自定义平台 ID（逗号分隔）' : 'Custom platform IDs (comma-separated)'}
                  </label>
                  <input
                    className="vm-input"
                    value={formCustomPlatforms}
                    onChange={e => setFormCustomPlatforms(e.target.value)}
                    placeholder={lang === 'zh' ? '例如：new-platform-id, another-one' : 'e.g. new-platform-id, another-one'}
                    style={{ marginTop: 4, fontSize: 12 }}
                  />
                  <span className="vm-faint" style={{ fontSize: 10, marginTop: 2, display: 'block' }}>
                    {lang === 'zh'
                      ? '输入 newsnow 支持的任意平台 ID，会追加到已选平台之后'
                      : 'Any newsnow-supported platform ID, appended to selected platforms'}
                  </span>
                </div>
              </div>
              {/* Match mode */}
              <div className="vm-field">
                <label className="vm-label">{lang === 'zh' ? '匹配模式' : 'Match Mode'}</label>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <label className="vm-radio-label">
                    <input type="radio" value="any" checked={formMatchMode === 'any'} onChange={() => setFormMatchMode('any')} />
                    {lang === 'zh' ? '任一匹配' : 'Any'}
                  </label>
                  <label className="vm-radio-label">
                    <input type="radio" value="all" checked={formMatchMode === 'all'} onChange={() => setFormMatchMode('all')} />
                    {lang === 'zh' ? '全部匹配' : 'All'}
                  </label>
                </div>
              </div>
              {/* Push */}
              <div className="vm-field">
                <label className="vm-check-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={formPushEnabled} onChange={e => setFormPushEnabled(e.target.checked)} />
                  {lang === 'zh' ? '启用推送通知' : 'Enable push'}
                </label>
                {formPushEnabled && (
                  <div style={{ marginTop: 8 }}>
                    <label className="vm-faint" style={{ fontSize: 11 }}>{lang === 'zh' ? '推送通道' : 'Push channels'}</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                      {channels.filter(c => c.enabled).map(c => (
                        <button
                          key={c.id}
                          className={'vm-chip' + (formPushChannelIds.includes(c.id) ? ' active' : '')}
                          onClick={() => setFormPushChannelIds(prev =>
                            prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id],
                          )}
                        >
                          {c.name}
                        </button>
                      ))}
                      {channels.filter(c => c.enabled).length === 0 && (
                        <span className="vm-faint">{lang === 'zh' ? '请先在通知通道标签页创建通道' : 'Create a channel first'}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="vm-modal-footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="vm-btn vm-btn-ghost vm-btn-sm" onClick={() => { setShowSubForm(false); setEditSubId(null) }}>
                {lang === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button className="vm-btn vm-btn-primary vm-btn-sm" onClick={editSubId !== null ? handleUpdateSub : handleCreateSub}>
                {editSubId !== null ? (lang === 'zh' ? '保存' : 'Save') : (lang === 'zh' ? '创建' : 'Create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Channel Form Modal */}
      {showChannelForm && (
        <div className="vm-modal-overlay" onClick={() => { setShowChannelForm(false); setEditChannelId(null) }}>
          <div className="vm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="vm-modal-header">
              <h3>{editChannelId !== null ? (lang === 'zh' ? '编辑通知通道' : 'Edit Channel') : (lang === 'zh' ? '新建通知通道' : 'New Channel')}</h3>
            </div>
            <div className="vm-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="vm-field">
                <label className="vm-label">{lang === 'zh' ? '通道名称' : 'Name'}</label>
                <input className="vm-input" value={formChannelName} onChange={e => setFormChannelName(e.target.value)} placeholder={lang === 'zh' ? '例如：我的 QQ邮箱' : 'e.g. My QQ Email'} />
              </div>
              <div className="vm-field">
                <label className="vm-label">{lang === 'zh' ? '通道类型' : 'Type'}</label>
                <select className="vm-input" value={formChannelType} onChange={e => setFormChannelType(e.target.value)}>
                  <option value="webhook">Webhook</option>
                  <option value="bark">Bark (iOS)</option>
                  <option value="email">📧 Email</option>
                </select>
              </div>

              {/* ── Webhook fields ── */}
              {formChannelType === 'webhook' && (
                <div className="vm-field">
                  <label className="vm-label">Webhook URL</label>
                  <input className="vm-input" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} placeholder="https://hooks.example.com/..." />
                  <span className="vm-faint" style={{ fontSize: 11, marginTop: 4 }}>
                    {lang === 'zh' ? '支持企业微信、飞书、钉钉、Discord 等任意 Webhook' : 'Works with WeCom, Feishu, DingTalk, Discord, etc.'}
                  </span>
                </div>
              )}

              {/* ── Bark fields ── */}
              {formChannelType === 'bark' && (
                <>
                  <div className="vm-field">
                    <label className="vm-label">Device Key</label>
                    <input className="vm-input" value={barkDeviceKey} onChange={e => setBarkDeviceKey(e.target.value)} placeholder="从 Bark App 复制" />
                    <span className="vm-faint" style={{ fontSize: 11, marginTop: 4 }}>
                      {lang === 'zh' ? '打开 Bark App → 右上角 + → 复制 Device Key' : 'Open Bark app → tap + → copy Device Key'}
                    </span>
                  </div>
                  <div className="vm-field">
                    <label className="vm-label">{lang === 'zh' ? '服务器地址（可选）' : 'Server URL (optional)'}</label>
                    <input className="vm-input" value={barkServerUrl} onChange={e => setBarkServerUrl(e.target.value)} placeholder="https://api.day.app/push" />
                  </div>
                </>
              )}

              {/* ── Email fields ── */}
              {formChannelType === 'email' && (
                <>
                  <div className="vm-field">
                    <label className="vm-label">{lang === 'zh' ? 'QQ邮箱地址' : 'Email Address'}</label>
                    <input
                      className="vm-input"
                      value={emailAddress}
                      onChange={e => setEmailAddress(e.target.value)}
                      placeholder="yourname@qq.com"
                      type="email"
                    />
                    {emailAddress && detectEmailProvider(emailAddress) && (
                      <div style={{ marginTop: 6, padding: '8px 10px', borderRadius: 6, background: 'var(--vm-surface-2)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: 'var(--vm-accent)' }}>✅</span>
                        <span>
                          {lang === 'zh' ? '已识别：' : 'Detected: '}
                          <strong>{detectEmailProvider(emailAddress)!.name}</strong>
                          {' · '}
                          {detectEmailProvider(emailAddress)!.host}:{detectEmailProvider(emailAddress)!.port}
                        </span>
                      </div>
                    )}
                    {emailAddress && !detectEmailProvider(emailAddress) && (
                      <div style={{ marginTop: 6, padding: '8px 10px', borderRadius: 6, background: 'var(--vm-warn-soft)', fontSize: 12, color: 'var(--vm-warn)' }}>
                        {lang === 'zh' ? '未识别的邮箱，请手动填写下方 SMTP 信息' : 'Unknown email provider, please fill in SMTP info manually'}
                      </div>
                    )}
                  </div>
                  <div className="vm-field">
                    <label className="vm-label">
                      {lang === 'zh' ? '授权码' : 'Auth Code'}
                      <a
                        href="https://service.mail.qq.com/detail/0/75"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 11, marginLeft: 8, color: 'var(--vm-primary)', textDecoration: 'underline' }}
                      >
                        {lang === 'zh' ? '如何获取？' : 'How to get?'} <ExternalLink size={10} style={{ display: 'inline' }} />
                      </a>
                    </label>
                    <input
                      className="vm-input vm-input-mono"
                      value={emailAuthCode}
                      onChange={e => setEmailAuthCode(e.target.value)}
                      placeholder={lang === 'zh' ? '不是 QQ 密码，是邮箱设置里生成的授权码' : 'NOT your password — the auth code from email settings'}
                      type="password"
                    />
                  </div>
                  {/* Advanced SMTP fields for unrecognized providers */}
                  {emailAddress && !detectEmailProvider(emailAddress) && (
                    <div style={{ border: '1px solid var(--vm-border)', borderRadius: 8, padding: 10 }}>
                      <div className="vm-faint" style={{ fontSize: 11, marginBottom: 8 }}>
                        {lang === 'zh' ? '手动 SMTP 配置（已识别邮箱可跳过）' : 'Manual SMTP (auto-detected providers can skip)'}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
                        <input className="vm-input" placeholder="smtp.example.com" />
                        <input className="vm-input" placeholder="587" type="number" />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="vm-modal-footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="vm-btn vm-btn-ghost vm-btn-sm" onClick={() => { setShowChannelForm(false); setEditChannelId(null) }}>
                {lang === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button className="vm-btn vm-btn-primary vm-btn-sm" onClick={editChannelId !== null ? handleUpdateChannel : handleCreateChannel}>
                {editChannelId !== null ? (lang === 'zh' ? '保存' : 'Save') : (lang === 'zh' ? '创建' : 'Create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subscriptions Tab */}
      {tab === 'subscriptions' && (
        <div className="vm-sub-grid">
          {subscriptions.length === 0 ? (
            <div className="vm-empty" style={{ gridColumn: '1 / -1' }}>
              <Rss size={32} className="vm-muted" />
              <p>{lang === 'zh' ? '还没有关键词订阅' : 'No subscriptions yet'}</p>
              <p className="vm-faint">{lang === 'zh' ? '创建一个订阅来监控热点关键词' : 'Create a subscription to monitor hot trends'}</p>
            </div>
          ) : (
            subscriptions.map(sub => (
              <div key={sub.id} className="vm-card">
                <div className="vm-card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      className="vm-btn vm-btn-ghost vm-btn-sm"
                      style={{ padding: 2 }}
                      onClick={() => handleToggleSub(sub)}
                      title={sub.enabled ? (lang === 'zh' ? '禁用' : 'Disable') : (lang === 'zh' ? '启用' : 'Enable')}
                    >
                      {sub.enabled ? <Power size={16} className="vm-accent" /> : <PowerOff size={16} className="vm-muted" />}
                    </button>
                    <span className="vm-card-title" style={{ fontWeight: 600 }}>{sub.name}</span>
                    {sub.unread_count > 0 && (
                      <span className="vm-badge" style={{ background: 'var(--vm-primary)', color: '#fff', fontSize: 11, padding: '1px 6px', borderRadius: 99 }}>
                        {sub.unread_count}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      className="vm-btn vm-btn-ghost vm-btn-sm"
                      onClick={() => handleMatch(sub.id)}
                      disabled={matchingId === sub.id}
                      title={lang === 'zh' ? '立即匹配' : 'Match now'}
                    >
                      <Play size={14} className={matchingId === sub.id ? 'vm-spin' : ''} />
                    </button>
                    <button
                      className="vm-btn vm-btn-ghost vm-btn-sm"
                      onClick={() => openEditSub(sub)}
                      title={lang === 'zh' ? '编辑' : 'Edit'}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="vm-btn vm-btn-ghost vm-btn-sm"
                      onClick={() => handleDeleteSub(sub.id)}
                      title={lang === 'zh' ? '删除' : 'Delete'}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {/* Keywords & meta */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6, alignItems: 'center' }}>
                  {sub.keywords.map((kw, i) => (
                    <span key={i} className="vm-chip" style={{ fontSize: 11 }}>{kw}</span>
                  ))}
                  <span className="vm-faint" style={{ fontSize: 10, marginLeft: 4 }}>
                    {sub.platforms.includes('all')
                      ? (lang === 'zh' ? '全部平台' : 'All platforms')
                      : `${sub.platforms.length} ${lang === 'zh' ? '个平台' : ' platforms'}`}
                    {' · '}{sub.match_mode === 'any' ? 'OR' : 'AND'}
                    {sub.push_enabled ? ' · 🔔' : ''}
                  </span>
                </div>
                {/* Recent matches — always visible */}
                {(recentMatches[sub.id] || []).length > 0 ? (
                  <div className="vm-sub-matches">
                    {recentMatches[sub.id]!.slice(0, 3).map(match => {
                      const brand = PLATFORMS[match.platform] || { zh: match.platform, en: match.platform, short: '?', color: '#94a3b8' }
                      return (
                        <button
                          key={match.id}
                          className="vm-sub-match-item"
                          onClick={() => handleSelectItem(match)}
                          title={match.title}
                        >
                          <span className="vm-sub-match-pf" style={{ background: brand.color }}>{brand.short}</span>
                          <span className="vm-sub-match-title">{match.title}</span>
                          <span className="vm-sub-match-time">
                            {match.matched_at ? new Date(match.matched_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                        </button>
                      )
                    })}
                    {recentMatches[sub.id]!.length > 3 && (
                      <button
                        className="vm-btn vm-btn-ghost vm-btn-sm"
                        style={{ fontSize: 11, alignSelf: 'flex-start', marginTop: 2 }}
                        onClick={() => setExpandedSubId(expandedSubId === sub.id ? null : sub.id)}
                      >
                        {expandedSubId === sub.id
                          ? (lang === 'zh' ? '收起' : 'Collapse')
                          : (lang === 'zh' ? `查看全部 ${recentMatches[sub.id]!.length} 条` : `View all ${recentMatches[sub.id]!.length}`)}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="vm-faint" style={{ fontSize: 11, padding: '4px 0' }}>
                    {sub.last_matched_at
                      ? (lang === 'zh' ? '上次匹配未发现新热点' : 'No new matches in last check')
                      : (lang === 'zh' ? '尚未匹配，点击 ▶ 开始' : 'Not matched yet, click ▶ to start')}
                    {sub.last_matched_at && (
                      <span> · {new Date(sub.last_matched_at).toLocaleString()}</span>
                    )}
                  </div>
                )}
                {expandedSubId === sub.id && (
                  <SubscriptionDetail subscriptionId={sub.id} onSelectItem={handleSelectItem} />
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Channels Tab */}
      {tab === 'channels' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {channels.length === 0 ? (
            <div className="vm-empty">
              <Bell size={32} className="vm-muted" />
              <p>{lang === 'zh' ? '还没有通知通道' : 'No notification channels'}</p>
              <p className="vm-faint">{lang === 'zh' ? '创建一个通知通道来接收热点推送' : 'Create a channel to receive trend notifications'}</p>
            </div>
          ) : (
            channels.map(ch => (
              <div key={ch.id} className="vm-card">
                <div className="vm-card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      className="vm-btn vm-btn-ghost vm-btn-sm"
                      style={{ padding: 2 }}
                      onClick={() => handleToggleChannel(ch)}
                      title={ch.enabled ? (lang === 'zh' ? '禁用' : 'Disable') : (lang === 'zh' ? '启用' : 'Enable')}
                    >
                      {ch.enabled ? <Power size={16} className="vm-accent" /> : <PowerOff size={16} className="vm-muted" />}
                    </button>
                    <span style={{ fontWeight: 600 }}>{ch.name}</span>
                    <span className="vm-chip" style={{ fontSize: 11, textTransform: 'uppercase' }}>{ch.type}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="vm-btn vm-btn-outline vm-btn-sm" onClick={() => handleTestChannel(ch.id)}>
                      {lang === 'zh' ? '测试' : 'Test'}
                    </button>
                    <button className="vm-btn vm-btn-ghost vm-btn-sm" onClick={() => openEditChannel(ch)}>
                      <Pencil size={14} />
                    </button>
                    <button className="vm-btn vm-btn-ghost vm-btn-sm" onClick={() => handleDeleteChannel(ch.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="vm-faint" style={{ fontSize: 12 }}>
                  {ch.type === 'email' && (
                    <span>📧 {(ch.config as Record<string, unknown>).smtp_user as string || (ch.config as Record<string, unknown>).to as string || '—'}</span>
                  )}
                  {ch.type === 'webhook' && (
                    <span>🔗 {(ch.config as Record<string, unknown>).url as string || '—'}</span>
                  )}
                  {ch.type === 'bark' && (
                    <span>📱 {(ch.config as Record<string, unknown>).device_key as string || '—'}</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default SubscriptionsPage
