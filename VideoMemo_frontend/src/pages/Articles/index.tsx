import { useEffect, useMemo, useState } from 'react'
import { BookOpenText, ExternalLink, RefreshCw, Rss, Search, Send, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  createArticleSubscription,
  generateArticle,
  listArticleItems,
  listArticleSubscriptions,
  refreshArticleSubscription,
  searchArticles,
  summarizeArticleItem,
  type ArticleItem,
  type ArticlePlatform,
  type ArticleSubscription,
  type ArticleSubscriptionType,
} from '@/services/article'
import { useModelStore } from '@/store/modelStore'
import { useTaskStore } from '@/store/taskStore'

const platforms: Array<{ value: ArticlePlatform; label: string }> = [
  { value: 'wechat_mp', label: '微信公众号' },
  { value: 'xiaohongshu', label: '小红书' },
]

const subscriptionTypes: Array<{ value: ArticleSubscriptionType; label: string }> = [
  { value: 'keyword', label: '关键字' },
  { value: 'publisher', label: '发布者' },
]

export default function ArticlesPage() {
  const { modelList, loadEnabledModels } = useModelStore()
  const { addPendingTask, setCurrentTask } = useTaskStore()
  const [platform, setPlatform] = useState<ArticlePlatform>('wechat_mp')
  const [url, setUrl] = useState('')
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState('')
  const [subscriptionType, setSubscriptionType] = useState<ArticleSubscriptionType>('keyword')
  const [style] = useState('minimal')
  const [extras, setExtras] = useState('')
  const [items, setItems] = useState<ArticleItem[]>([])
  const [subscriptions, setSubscriptions] = useState<ArticleSubscription[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    loadEnabledModels()
    listArticleSubscriptions().then(setSubscriptions).catch(() => setSubscriptions([]))
    listArticleItems().then(setItems).catch(() => setItems([]))
  }, [loadEnabledModels])

  const selectedModel = useMemo(() => modelList[0], [modelList])
  const providerId = selectedModel?.provider_id || ''
  const modelName = selectedModel?.model_name || ''

  const submitDirect = async () => {
    if (!url.trim()) {
      toast.error('请输入文章链接')
      return
    }
    if (!providerId || !modelName) {
      toast.error('请先配置可用模型')
      return
    }
    setBusy(true)
    try {
      const data = await generateArticle({
        url: url.trim(),
        platform,
        provider_id: providerId,
        model_name: modelName,
        style,
        extras,
      })
      ;(addPendingTask as any)(data.task_id, platform, {
        video_url: url.trim(),
        platform,
        quality: 'medium',
        model_name: modelName,
        provider_id: providerId,
        style,
        extras,
      })
      setCurrentTask(data.task_id)
      toast.success('文章总结任务已提交')
    } finally {
      setBusy(false)
    }
  }

  const submitSearch = async () => {
    if (!keyword.trim()) {
      toast.error('请输入关键字')
      return
    }
    setBusy(true)
    try {
      const data = await searchArticles({ platform, keyword: keyword.trim(), limit: 20 })
      setItems(data.items)
      toast.success(`找到 ${data.items.length} 篇文章`)
    } finally {
      setBusy(false)
    }
  }

  const submitSubscription = async () => {
    if (!query.trim()) {
      toast.error('请输入订阅内容')
      return
    }
    const created = await createArticleSubscription({
      platform,
      type: subscriptionType,
      query: query.trim(),
      label: query.trim(),
    })
    setSubscriptions([created, ...subscriptions])
    setQuery('')
    toast.success('订阅已创建')
  }

  const refreshSubscription = async (subscription: ArticleSubscription) => {
    setBusy(true)
    try {
      const data = await refreshArticleSubscription(subscription.id)
      setItems(data.items)
      toast.success(`刷新到 ${data.count} 篇文章`)
    } finally {
      setBusy(false)
    }
  }

  const summarizeItem = async (item: ArticleItem) => {
    if (!providerId || !modelName) {
      toast.error('请先配置可用模型')
      return
    }
    const data = await summarizeArticleItem(item.id, {
      provider_id: providerId,
      model_name: modelName,
      style,
      extras,
    })
    ;(addPendingTask as any)(data.task_id, item.platform, {
      video_url: item.url,
      platform: item.platform,
      quality: 'medium',
      model_name: modelName,
      provider_id: providerId,
      style,
      extras,
    })
    setCurrentTask(data.task_id)
    toast.success('文章总结任务已提交')
  }

  return (
    <div className="vm-content-inner wide vm-fade-up">
      <div className="vm-col" style={{ gap: 18 }}>
        <div className="vm-card vm-card-pad">
          <div className="vm-row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <div className="vm-row" style={{ gap: 8 }}>
              <BookOpenText size={18} />
              <span className="vm-sec-title">文章总结</span>
              <span className="vm-sec-en">Xiaohongshu / WeChat</span>
            </div>
            <span className="vm-badge vm-badge-neutral">{modelName || '未选择模型'}</span>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '160px minmax(0, 1fr) auto',
              gap: 10,
            }}
          >
            <select
              className="vm-input"
              value={platform}
              onChange={e => setPlatform(e.target.value as ArticlePlatform)}
            >
              {platforms.map(item => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <input
              className="vm-input vm-input-mono"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="粘贴小红书图文或微信公众号文章链接"
            />
            <button className="vm-btn vm-btn-primary" disabled={busy} onClick={submitDirect}>
              <Send size={16} />
              生成总结
            </button>
          </div>
          <textarea
            className="vm-textarea"
            rows={3}
            value={extras}
            onChange={e => setExtras(e.target.value)}
            placeholder="额外要求，可选"
            style={{ marginTop: 10 }}
          />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
            gap: 18,
            alignItems: 'start',
          }}
        >
          <div className="vm-card vm-card-pad">
            <div className="vm-row" style={{ gap: 8, marginBottom: 12 }}>
              <Search size={18} />
              <span className="vm-sec-title">关键字查询</span>
            </div>
            <div className="vm-row" style={{ gap: 10 }}>
              <input
                className="vm-input"
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                placeholder="输入关键字"
              />
              <button className="vm-btn vm-btn-outline" disabled={busy} onClick={submitSearch}>
                查询
              </button>
            </div>
          </div>

          <div className="vm-card vm-card-pad">
            <div className="vm-row" style={{ gap: 8, marginBottom: 12 }}>
              <Rss size={18} />
              <span className="vm-sec-title">订阅</span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '118px minmax(0, 1fr) auto',
                gap: 10,
              }}
            >
              <select
                className="vm-input"
                value={subscriptionType}
                onChange={e => setSubscriptionType(e.target.value as ArticleSubscriptionType)}
              >
                {subscriptionTypes.map(item => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <input
                className="vm-input"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="关键字、作者名、公众号名或主页链接"
              />
              <button className="vm-btn vm-btn-primary" onClick={submitSubscription}>
                <Sparkles size={16} />
                保存
              </button>
            </div>
            <div className="vm-col" style={{ gap: 8, marginTop: 12 }}>
              {subscriptions.map(subscription => (
                <div
                  key={subscription.id}
                  className="vm-row"
                  style={{ justifyContent: 'space-between', gap: 12 }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="truncate" style={{ fontWeight: 800 }}>
                      {subscription.label || subscription.query}
                    </div>
                    <div className="vm-faint" style={{ fontSize: 12 }}>
                      {subscription.type === 'keyword' ? '关键字' : '发布者'}
                      {subscription.last_error ? ` · ${subscription.last_error}` : ''}
                    </div>
                  </div>
                  <button
                    className="vm-btn vm-btn-outline vm-btn-sm"
                    disabled={busy}
                    onClick={() => refreshSubscription(subscription)}
                  >
                    <RefreshCw size={14} />
                    刷新
                  </button>
                </div>
              ))}
              {!subscriptions.length && (
                <div style={{ color: 'var(--vm-faint)', fontSize: 13 }}>暂无订阅。</div>
              )}
            </div>
          </div>
        </div>

        <div className="vm-card" style={{ overflow: 'hidden' }}>
          <div
            className="vm-row"
            style={{
              justifyContent: 'space-between',
              padding: '15px 20px',
              borderBottom: '1px solid var(--vm-border)',
            }}
          >
            <span className="vm-sec-title">发现的文章</span>
            <span className="vm-badge vm-badge-neutral">{items.length}</span>
          </div>
          {items.length === 0 ? (
            <div style={{ padding: '44px 20px', textAlign: 'center', color: 'var(--vm-faint)' }}>
              暂无文章，试试关键字查询或刷新订阅。
            </div>
          ) : (
            items.map(item => (
              <div
                key={item.id}
                className="vm-row"
                style={{
                  gap: 12,
                  padding: '12px 20px',
                  borderBottom: '1px solid var(--vm-border)',
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="truncate" style={{ fontWeight: 850 }}>
                    {item.title}
                  </div>
                  <div className="vm-faint truncate" style={{ fontSize: 12.5 }}>
                    {item.author_name || item.platform}
                  </div>
                </div>
                <button className="vm-btn vm-btn-outline vm-btn-sm" onClick={() => window.open(item.url, '_blank')}>
                  <ExternalLink size={14} />
                  原文
                </button>
                <button className="vm-btn vm-btn-primary vm-btn-sm" onClick={() => summarizeItem(item)}>
                  总结
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
