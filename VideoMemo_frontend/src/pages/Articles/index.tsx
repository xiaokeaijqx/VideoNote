import { useEffect, useMemo, useState } from 'react'
import {
  BookOpenText,
  CheckCircle2,
  ClipboardPaste,
  ExternalLink,
  FileText,
  Inbox,
  Layers3,
  Plus,
  Rss,
  Search,
  Send,
  Sparkles,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  generateArticle,
  getArticleItem,
  importArticleContent,
  listArticleItems,
  listArticleSubscriptions,
  searchArticles,
  summarizeArticleItem,
  type ArticleItem,
  type ArticlePlatform,
  type ArticleSubscription,
} from '@/services/article'
import { useModelStore } from '@/store/modelStore'
import { useTaskStore } from '@/store/taskStore'
import { VmSelect } from '@/components/design/VmSelect'

const platforms: Array<{ value: ArticlePlatform; label: string }> = [
  { value: 'generic_web', label: '普通网页' },
  { value: 'wechat_mp', label: '微信公众号' },
  { value: 'xiaohongshu', label: '小红书' },
]

const showKeywordSearch = false

interface ArticleTaskFormData {
  video_url: string
  platform: string
  quality: string
  model_name: string
  provider_id: string
  style: string
  extras?: string
}

const shouldSkipArticleLine = (line: string) => {
  const text = line.trim()
  if (!text) return true
  return (
    /^(原创|发布|版权声明|CC\s|阅读|点赞|收藏|评论|分享|关注|展开全文)$/i.test(text) ||
    /版权|版权协议|转载请|原文出处|本文为博主原创文章|文章标签|最新推荐文章于/i.test(text) ||
    /^[·.。]+$/.test(text) ||
    /^#/.test(text) ||
    /^\d+(\.\d+)?[kK]?\s*(阅读|点赞|收藏|评论)?$/.test(text) ||
    /^CC\s+\d/i.test(text)
  )
}

const renderArticleContent = (content: string) => {
  const lines = content
    .split(/\n+/)
    .map(line => line.trim())
    .filter(line => !shouldSkipArticleLine(line))

  return lines.map((line, index) => {
    const isList = /^([0-9]+[.、]|[-*•])\s+/.test(line)
    const isHeading =
      !isList &&
      line.length <= 34 &&
      (/^第?[一二三四五六七八九十0-9]+[章节、.]/.test(line) ||
        /[:：]$/.test(line) ||
        /^(适用人群|目标|阶段安排|学习计划|复习计划|备考建议|考试策略|总结|参考资料)$/.test(line))

    if (isHeading) {
      return (
        <h4 key={`${line}-${index}`} className="vm-article-reader-heading">
          {line.replace(/[:：]$/, '')}
        </h4>
      )
    }

    return (
      <p key={`${line}-${index}`} className={isList ? 'vm-article-reader-list' : undefined}>
        {line}
      </p>
    )
  })
}

export default function ArticlesPage() {
  const { modelList, loadEnabledModels } = useModelStore()
  const { addPendingTask, setCurrentTask } = useTaskStore()
  const [platform, setPlatform] = useState<ArticlePlatform>('wechat_mp')
  const [url, setUrl] = useState('')
  const [keyword, setKeyword] = useState('')
  const [style] = useState('minimal')
  const [extras, setExtras] = useState('')
  const [draftTitle, setDraftTitle] = useState('')
  const [draftContent, setDraftContent] = useState('')
  const [items, setItems] = useState<ArticleItem[]>([])
  const [allArticleCount, setAllArticleCount] = useState(0)
  const [subscriptions, setSubscriptions] = useState<ArticleSubscription[]>([])
  const [selectedSubscriptionId, setSelectedSubscriptionId] = useState<number | null>(null)
  const [selectedArticleId, setSelectedArticleId] = useState<number | null>(null)
  const [selectedArticleDetail, setSelectedArticleDetail] = useState<ArticleItem | null>(null)
  const [articleDetailLoading, setArticleDetailLoading] = useState(false)
  const [panelMode, setPanelMode] = useState<'article' | 'subscription'>('article')
  const [articlePanelMode, setArticlePanelMode] = useState<'create' | 'read'>('create')
  const [sidePanelOpen, setSidePanelOpen] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    loadEnabledModels()
    listArticleSubscriptions().then(setSubscriptions).catch(() => setSubscriptions([]))
    listArticleItems()
      .then(data => {
        setItems(data)
        setAllArticleCount(data.length)
      })
      .catch(() => {
        setItems([])
        setAllArticleCount(0)
      })
  }, [loadEnabledModels])

  const selectedModel = useMemo(() => modelList[0], [modelList])
  const providerId = selectedModel?.provider_id || ''
  const modelName = selectedModel?.model_name || ''
  const addArticlePendingTask = addPendingTask as unknown as (
    taskId: string,
    platform: string,
    formData: ArticleTaskFormData,
  ) => void
  const selectedSubscription = useMemo(
    () => subscriptions.find(item => item.id === selectedSubscriptionId) || null,
    [selectedSubscriptionId, subscriptions],
  )
  const selectedArticle = useMemo(
    () => (selectedArticleId ? items.find(item => item.id === selectedArticleId) || null : null),
    [items, selectedArticleId],
  )
  const selectedArticleResolvedId = selectedArticle?.id || null
  const selectedArticleContent =
    selectedArticleDetail?.id === selectedArticleResolvedId
      ? typeof selectedArticleDetail.content_text === 'string'
        ? selectedArticleDetail.content_text.trim()
        : ''
      : ''
  const platformLabel = (value: ArticlePlatform) =>
    platforms.find(item => item.value === value)?.label || value
  const subscriptionFilterValue = selectedSubscriptionId === null ? 'all' : String(selectedSubscriptionId)
  const subscriptionOptions = [
    { value: 'all', label: `全部文章 (${allArticleCount})` },
    ...subscriptions.map(subscription => ({
      value: String(subscription.id),
      label: `${subscription.label || subscription.query} · ${platformLabel(subscription.platform)}`,
    })),
  ]

  const selectSubscriptionFilter = (value: string) => {
    if (value === 'all') {
      showAllArticles()
      return
    }
    const subscription = subscriptions.find(item => String(item.id) === value)
    if (subscription) openSubscription(subscription)
  }

  useEffect(() => {
    if (!selectedArticleResolvedId) {
      setSelectedArticleDetail(null)
      return
    }
    let cancelled = false
    setArticleDetailLoading(true)
    getArticleItem(selectedArticleResolvedId)
      .then(data => {
        if (!cancelled) setSelectedArticleDetail(data)
      })
      .catch(() => {
        if (!cancelled) setSelectedArticleDetail(null)
      })
      .finally(() => {
        if (!cancelled) setArticleDetailLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedArticleResolvedId])

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
      addArticlePendingTask(data.task_id, platform, {
        video_url: url.trim(),
        platform,
        quality: 'medium',
        model_name: modelName,
        provider_id: providerId,
        style,
        extras,
      })
      setCurrentTask(data.task_id)
      listArticleItems()
        .then(nextItems => {
          setItems(nextItems)
          setAllArticleCount(nextItems.length)
          setSelectedArticleId(data.article_item_id)
        })
        .catch(() => {})
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
      setSelectedArticleId(null)
      setSidePanelOpen(true)
      setPanelMode('article')
      setArticlePanelMode('create')
      listArticleItems()
        .then(allItems => setAllArticleCount(allItems.length))
        .catch(() => {})
      if (data.items.length) {
        toast.success(`找到 ${data.items.length} 篇文章`)
      } else {
        toast.error('没有找到文章，换个关键字或平台试试')
      }
    } finally {
      setBusy(false)
    }
  }

  const submitImportContent = async () => {
    if (!draftContent.trim()) {
      toast.error('请输入文章正文')
      return
    }
    if (!providerId || !modelName) {
      toast.error('请先配置可用模型')
      return
    }
    setBusy(true)
    try {
      const data = await importArticleContent({
        url: url.trim(),
        platform,
        title: draftTitle.trim(),
        content_text: draftContent.trim(),
        provider_id: providerId,
        model_name: modelName,
        style,
        extras,
      })
      addArticlePendingTask(data.task_id, platform, {
        video_url: url.trim() || draftTitle.trim() || 'imported-article',
        platform,
        quality: 'medium',
        model_name: modelName,
        provider_id: providerId,
        style,
        extras,
      })
      setCurrentTask(data.task_id)
      listArticleItems()
        .then(nextItems => {
          setItems(nextItems)
          setAllArticleCount(nextItems.length)
          setSelectedArticleId(data.article_item_id)
        })
        .catch(() => {})
      toast.success('文章已导入并提交总结')
    } finally {
      setBusy(false)
    }
  }

  const showAllArticles = async () => {
    setSelectedSubscriptionId(null)
    setBusy(true)
    try {
      const data = await listArticleItems()
      setItems(data)
      setAllArticleCount(data.length)
      setSelectedArticleId(null)
      setSidePanelOpen(true)
      setPanelMode('article')
      setArticlePanelMode('create')
    } finally {
      setBusy(false)
    }
  }

  const openSubscription = async (subscription: ArticleSubscription) => {
    setSelectedSubscriptionId(subscription.id)
    setBusy(true)
    try {
      const data = await listArticleItems(subscription.id)
      setItems(data)
      setSelectedArticleId(null)
      setSidePanelOpen(true)
      setPanelMode('article')
      setArticlePanelMode('create')
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
    addArticlePendingTask(data.task_id, item.platform, {
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
    <div className={'vm-ws vm-article-ws vm-fade-up' + (sidePanelOpen ? ' side-open' : '')}>
      <div className="vm-reader vm-article-main" style={{ background: 'var(--vm-bg)' }}>
        <div className="vm-article-reader-inner">
          {showKeywordSearch && (
            <section className="vm-card vm-card-pad vm-article-search-card">
              <div className="vm-row" style={{ gap: 10, width: '100%' }}>
                <VmSelect
                  className="vm-article-select"
                  value={platform}
                  onChange={value => setPlatform(value as ArticlePlatform)}
                  options={platforms.map(item => ({ value: item.value, label: item.label }))}
                />
                <input
                  className="vm-input"
                  value={keyword}
                  onChange={e => setKeyword(e.target.value)}
                  placeholder="搜索文章关键字"
                />
                <button className="vm-btn vm-btn-outline" disabled={busy} onClick={submitSearch}>
                  <Search size={16} />
                  查询
                </button>
              </div>
            </section>
          )}

          <section className="vm-card vm-article-list-card">
            <div className="vm-article-list-head">
              <div className="vm-row" style={{ gap: 8 }}>
                <Layers3 size={18} />
                <span className="vm-sec-title">文章列表</span>
              </div>
              <div className="vm-row" style={{ gap: 8 }}>
                <span className="vm-badge vm-badge-neutral">{items.length}</span>
                <button
                  className="vm-btn vm-btn-primary vm-btn-sm"
                  onClick={() => {
                    setSidePanelOpen(true)
                    setPanelMode('article')
                    setArticlePanelMode('create')
                  }}
                >
                  <Plus size={14} />
                  新增文章
                </button>
              </div>
            </div>
            <div className="vm-article-sub-strip">
              <VmSelect
                className="vm-note-filter-select vm-article-sub-select"
                value={subscriptionFilterValue}
                onChange={selectSubscriptionFilter}
                options={subscriptionOptions}
                renderOption={option => (
                  <span className="vm-row" style={{ gap: 8, minWidth: 0 }}>
                    {option.value === 'all' ? <Inbox size={15} /> : <Rss size={15} />}
                    <span className="truncate">{option.label ?? option.value}</span>
                  </span>
                )}
              />
            </div>
            {items.length === 0 ? (
              <div className="vm-article-empty vm-article-empty-large">
                {selectedSubscription
                  ? '这个订阅暂时没有文章，可以换一个订阅查看。'
                  : '暂无文章，可以先新增文章或选择其他订阅。'}
              </div>
            ) : (
              items.map(item => (
                <div
                  key={item.id}
                  className={'vm-article-item' + (selectedArticle?.id === item.id ? ' active' : '')}
                  onClick={() => {
                    setSelectedArticleId(item.id)
                    setSidePanelOpen(true)
                    setPanelMode('article')
                    setArticlePanelMode('read')
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="truncate" style={{ fontWeight: 850 }}>
                      {item.title}
                    </div>
                    <div className="vm-faint truncate" style={{ fontSize: 12.5 }}>
                      {item.author_name || platformLabel(item.platform)}
                    </div>
                  </div>
                  <span className={'vm-article-status status-' + item.summary_status}>
                    {item.summary_status === 'summarized' ? '已总结' : item.summary_status || '待处理'}
                  </span>
                  <button
                    className="vm-btn vm-btn-outline vm-btn-sm"
                    onClick={e => {
                      e.stopPropagation()
                      window.open(item.url, '_blank')
                    }}
                  >
                    <ExternalLink size={14} />
                    原文
                  </button>
                  <button
                    className="vm-btn vm-btn-primary vm-btn-sm"
                    onClick={e => {
                      e.stopPropagation()
                      summarizeItem(item)
                    }}
                  >
                    总结
                  </button>
                </div>
              ))
            )}
          </section>
        </div>
      </div>

      {sidePanelOpen && (
      <aside className="vm-article-side">
        <div className="vm-article-side-tabs">
          <button
            className={'vm-article-side-tab' + (panelMode === 'article' ? ' active' : '')}
            onClick={() => {
              setSidePanelOpen(true)
              setPanelMode('article')
              setArticlePanelMode(selectedArticle ? 'read' : 'create')
            }}
          >
            <FileText size={15} />
            文章
          </button>
          <button className="vm-article-side-close" title="关闭" onClick={() => setSidePanelOpen(false)}>
            <X size={15} />
          </button>
        </div>

        {articlePanelMode === 'create' ? (
            <section className="vm-card vm-card-pad vm-article-side-card">
              <div className="vm-row" style={{ gap: 8, marginBottom: 12 }}>
                <Send size={18} />
                <span className="vm-sec-title">新增文章</span>
              </div>
              <div className="vm-article-side-form">
                <VmSelect
                  className="vm-article-select"
                  value={platform}
                  onChange={value => setPlatform(value as ArticlePlatform)}
                  options={platforms.map(item => ({ value: item.value, label: item.label }))}
                />
                <input
                  className="vm-input vm-input-mono"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="文章链接"
                />
                <button className="vm-btn vm-btn-primary vm-btn-block" disabled={busy} onClick={submitDirect}>
                  <Sparkles size={16} />
                  链接总结
                </button>
                <input
                  className="vm-input"
                  value={draftTitle}
                  onChange={e => setDraftTitle(e.target.value)}
                  placeholder="文章标题，可选"
                />
                <textarea
                  className="vm-textarea vm-article-content-input"
                  rows={7}
                  value={draftContent}
                  onChange={e => setDraftContent(e.target.value)}
                  placeholder="粘贴文章正文"
                />
                <button
                  className="vm-btn vm-btn-outline vm-btn-block"
                  disabled={busy}
                  onClick={submitImportContent}
                >
                  <ClipboardPaste size={16} />
                  导入正文
                </button>
                <textarea
                  className="vm-textarea"
                  rows={3}
                  value={extras}
                  onChange={e => setExtras(e.target.value)}
                  placeholder="额外要求，可选"
                />
              </div>
            </section>
          ) : (
            <section className="vm-card vm-card-pad vm-article-side-card vm-article-preview-card">
              <div className="vm-row" style={{ gap: 8, marginBottom: 12 }}>
                <BookOpenText size={18} />
                <span className="vm-sec-title">站内阅读</span>
              </div>
              {selectedArticle ? (
                <>
                  <div className="vm-article-preview-title">{selectedArticle.title}</div>
                  <div className="vm-article-preview-meta">
                    {selectedArticle.author_name || platformLabel(selectedArticle.platform)}
                    {selectedArticle.published_at ? ` · ${selectedArticle.published_at}` : ''}
                  </div>
                  <div className="vm-article-preview-box">
                    {articleDetailLoading ? (
                      <span>正文加载中...</span>
                    ) : selectedArticleContent ? (
                      renderArticleContent(selectedArticleContent)
                    ) : (
                      <span>暂时没有可展示的正文。可以打开原文，或重新发起总结让系统抓取并保存正文。</span>
                    )}
                  </div>
                  <div className="vm-article-preview-actions">
                    <button className="vm-btn vm-btn-outline vm-btn-sm" onClick={() => window.open(selectedArticle.url, '_blank')}>
                      <ExternalLink size={14} />
                      原文
                    </button>
                    <button className="vm-btn vm-btn-primary vm-btn-sm" onClick={() => summarizeItem(selectedArticle)}>
                      <CheckCircle2 size={14} />
                      总结
                    </button>
                  </div>
                </>
              ) : (
                <div className="vm-article-empty">选择一篇文章查看内容</div>
              )}
            </section>
        )}
      </aside>
      )}
    </div>
  )
}
