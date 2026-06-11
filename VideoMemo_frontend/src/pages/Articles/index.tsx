import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
  Star,
  Loader2,
  Bot,
} from 'lucide-react'
import toast from 'react-hot-toast'
import ReactMarkdown from 'react-markdown'
import gfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import 'github-markdown-css/github-markdown-light.css'


import {
  generateArticle,
  getArticleItem,
  importArticleContent,
  listArticleItems,
  listArticleSubscriptions,
  searchArticles,
  summarizeArticleItem,
  fetchArticleOnly,
  importArticleOnly,
  type ArticleItem,
  type ArticlePlatform,
  type ArticleSubscription,
} from '@/services/article'
import { get_task_status } from '@/services/note'
import { useModelStore } from '@/store/modelStore'
import { useTaskStore } from '@/store/taskStore'
import { VmSelect } from '@/components/design/VmSelect'
import { NoteThumb } from '@/components/design/NoteThumb'
import { Pf } from '@/components/design/PlatformAvatar'
import { Field } from '@/components/design/Field'
import { noteStyles } from '@/constant/note'
import { useVmLang, trVm } from '@/i18n/redesign'


const platforms: Array<{ value: ArticlePlatform; label: string }> = [
  { value: 'wechat_mp', label: '微信公众号' },
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'generic_web', label: '普通网页' },
]

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
  const lang = useVmLang()
  const navigate = useNavigate()
  const { modelList, loadEnabledModels } = useModelStore()
  const { tasks, addPendingTask } = useTaskStore()
  
  // Selection / listing state
  const [selectedArticleId, setSelectedArticleId] = useState<number | null>(null)
  const [selectedArticleDetail, setSelectedArticleDetail] = useState<ArticleItem | null>(null)
  const [items, setItems] = useState<ArticleItem[]>([])
  const [allArticleCount, setAllArticleCount] = useState(0)
  const [subscriptions, setSubscriptions] = useState<ArticleSubscription[]>([])
  const [selectedSubscriptionId, setSelectedSubscriptionId] = useState<number | null>(null)
  
  // Input form state
  const [platform, setPlatform] = useState<ArticlePlatform>('wechat_mp')
  const [url, setUrl] = useState('')
  const [draftTitle, setDraftTitle] = useState('')
  const [draftContent, setDraftContent] = useState('')
  
  // Summary Options state
  const [modelName, setModelName] = useState('')
  const [style, setStyle] = useState('minimal')
  const [extras, setExtras] = useState('')

  
  // Search query in rail
  const [searchQuery, setSearchQuery] = useState('')
  
  // Loading states
  const [articleDetailLoading, setArticleDetailLoading] = useState(false)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  
  // Reader view active tab: 'original' | 'ai'
  const [activeTab, setActiveTab] = useState<'original' | 'ai'>('original')
  const [summaryContent, setSummaryContent] = useState<string>('')
  
  // Form active tab: 'fetch' | 'import'
  const [formTab, setFormTab] = useState<'fetch' | 'import'>('fetch')

  // Load models and initial data
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

  const selectedModel = useMemo(() => {
    return modelList.find(m => m.model_name === modelName) || modelList[0]
  }, [modelList, modelName])
  const providerId = selectedModel?.provider_id || ''
  
  useEffect(() => {
    if (!modelName && modelList[0]?.model_name) setModelName(modelList[0].model_name)
  }, [modelList, modelName])


  const platformLabel = (value: ArticlePlatform) =>
    platforms.find(item => item.value === value)?.label || value

  // Dropdown subscription filter options
  const subscriptionFilterValue = selectedSubscriptionId === null ? 'all' : String(selectedSubscriptionId)
  const subscriptionOptions = [
    { value: 'all', label: `全部文章 (${allArticleCount})` },
    ...subscriptions.map(sub => ({
      value: String(sub.id),
      label: `${sub.label || sub.query} · ${platformLabel(sub.platform)}`,
    })),
  ]

  const handleSelectSubscription = async (value: string) => {
    if (value === 'all') {
      setSelectedSubscriptionId(null)
      setBusy(true)
      try {
        const data = await listArticleItems()
        setItems(data)
        setAllArticleCount(data.length)
      } finally {
        setBusy(false)
      }
      return
    }
    const subId = Number(value)
    setSelectedSubscriptionId(subId)
    setBusy(true)
    try {
      const data = await listArticleItems(subId)
      setItems(data)
    } finally {
      setBusy(false)
    }
  }

  // Filtered items in the left rail list based on search and subscription
  const filteredItems = useMemo(() => {
    const kw = searchQuery.trim().toLowerCase()
    return items.filter(item => {
      if (!kw) return true
      return (
        item.title.toLowerCase().includes(kw) ||
        item.url.toLowerCase().includes(kw) ||
        (item.author_name && item.author_name.toLowerCase().includes(kw))
      )
    })
  }, [items, searchQuery])

  // Watch the task in taskStore if selected article is currently summarizing
  const polledTask = useMemo(() => {
    const taskId = selectedArticleDetail?.task_id
    if (!taskId) return null
    return tasks.find(t => t.id === taskId) || null
  }, [tasks, selectedArticleDetail?.task_id])

  // Sync polledTask status changes with article status and summary content
  useEffect(() => {
    if (!polledTask || !selectedArticleDetail) return
    if (polledTask.status === 'SUCCESS' && selectedArticleDetail.summary_status !== 'summarized') {
      getArticleItem(selectedArticleDetail.id).then(data => {
        setSelectedArticleDetail(data)
        let mdContent = ''
        if (Array.isArray(polledTask.markdown)) {
          const sorted = [...polledTask.markdown].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )
          mdContent = sorted[0]?.content || ''
        } else {
          mdContent = polledTask.markdown || ''
        }
        setSummaryContent(mdContent)
        setItems(prev => prev.map(x => x.id === data.id ? data : x))
      })
    } else if (polledTask.status === 'FAILED' && selectedArticleDetail.summary_status !== 'failed') {
      setSelectedArticleDetail(prev => prev ? { ...prev, summary_status: 'failed' } : null)
      setItems(prev => prev.map(x => x.id === selectedArticleDetail.id ? { ...x, summary_status: 'failed' } : x))
    }
  }, [polledTask?.status, selectedArticleDetail?.id])

  // Load article detail when active article selection changes
  useEffect(() => {
    if (selectedArticleId === null) {
      setSelectedArticleDetail(null)
      setSummaryContent('')
      setActiveTab('original')
      return
    }
    let cancelled = false
    setArticleDetailLoading(true)
    setSummaryContent('')
    getArticleItem(selectedArticleId)
      .then(async data => {
        if (cancelled) return
        setSelectedArticleDetail(data)
        
        // If summarized, load Markdown notes from store or backend
        if (data.summary_status === 'summarized' && data.task_id) {
          setSummaryLoading(true)
          try {
            const localTask = useTaskStore.getState().tasks.find(t => t.id === data.task_id)
            if (localTask) {
              let mdContent = ''
              if (Array.isArray(localTask.markdown)) {
                const sorted = [...localTask.markdown].sort(
                  (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                )
                mdContent = sorted[0]?.content || ''
              } else {
                mdContent = localTask.markdown || ''
              }
              setSummaryContent(mdContent)
            } else {
              const res = await get_task_status(data.task_id)
              if (res && res.status === 'SUCCESS') {
                const result = res.result || {}
                let mdContent = ''
                if (Array.isArray(result.markdown)) {
                  const sorted = [...result.markdown].sort(
                    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                  )
                  mdContent = sorted[0]?.content || ''
                } else if (typeof result.markdown === 'string') {
                  mdContent = result.markdown
                }
                setSummaryContent(mdContent)
              }
            }
          } catch (e) {
            console.error('Failed to load summary content:', e)
          } finally {
            if (!cancelled) setSummaryLoading(false)
          }
        }
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
  }, [selectedArticleId])

  // Crawl/Fetch article without summary
  const handleFetch = async () => {
    if (!url.trim()) {
      toast.error('请输入文章链接')
      return
    }
    setBusy(true)
    try {
      const data = await fetchArticleOnly({
        url: url.trim(),
        platform,
      })
      const nextItems = await listArticleItems(selectedSubscriptionId || undefined)
      setItems(nextItems)
      setAllArticleCount(nextItems.length)
      setSelectedArticleId(data.id)
      
      // Clear inputs
      setUrl('')
      toast.success('文章爬取成功，已加入列表')
    } catch (e: any) {
      toast.error(e?.message || '文章爬取失败，请检查链接或网络')
    } finally {
      setBusy(false)
    }
  }

  // Import article text only
  const handleImport = async () => {
    if (!draftContent.trim()) {
      toast.error('请输入文章正文')
      return
    }
    setBusy(true)
    try {
      const data = await importArticleOnly({
        url: url.trim(),
        platform,
        title: draftTitle.trim(),
        content_text: draftContent.trim(),
      })
      const nextItems = await listArticleItems(selectedSubscriptionId || undefined)
      setItems(nextItems)
      setAllArticleCount(nextItems.length)
      setSelectedArticleId(data.id)
      
      // Clear inputs
      setUrl('')
      setDraftTitle('')
      setDraftContent('')
      toast.success('文章正文导入成功')
    } catch (e: any) {
      toast.error(e?.message || '文章导入失败')
    } finally {
      setBusy(false)
    }
  }

  // Summarize an existing article
  const handleSummarize = async () => {
    if (!selectedArticleDetail) return
    if (!providerId || !modelName) {
      toast.error('请配置并启用可用 AI 模型')
      return
    }
    setBusy(true)
    try {
      const data = await summarizeArticleItem(selectedArticleDetail.id, {
        provider_id: providerId,
        model_name: modelName,
        style,
        extras,
      })
      
      // Register task in taskStore for global polling
      addPendingTask(data.task_id, selectedArticleDetail.platform, {
        video_url: selectedArticleDetail.url,
        platform: selectedArticleDetail.platform,
        quality: 'medium',
        model_name: modelName,
        provider_id: providerId,
        style,
        extras,
      })

      // Update UI states locally
      const updatedArticle = {
        ...selectedArticleDetail,
        summary_status: 'summarizing',
        task_id: data.task_id,
      }
      setSelectedArticleDetail(updatedArticle)
      setItems(prev => prev.map(x => x.id === updatedArticle.id ? updatedArticle : x))
      
      toast.success('AI 总结任务已提交，开始生成...')
    } catch (e: any) {
      toast.error('提交 AI 总结失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  // Translate statuses for display
  const renderStatus = (status: string) => {
    switch (status) {
      case 'summarized':
        return <span className="vm-article-status status-summarized">已总结</span>
      case 'summarizing':
        return <span className="vm-article-status status-summarizing">总结中</span>
      case 'failed':
        return <span className="vm-article-status status-failed">失败</span>
      default:
        return <span className="vm-article-status">待处理</span>
    }
  }

  return (
    <div className="vm-ws vm-fade-up">
      {/* Left Rail Listing Panel (consistent with main workspace rail) */}
      <aside className="vm-note-rail">
        <div className="vm-note-rail-head">
          <button className="vm-btn vm-btn-primary vm-btn-block" onClick={() => setSelectedArticleId(null)}>
            <Plus size={17} /> 新增文章
          </button>
          
          <div className="vm-note-search">
            <Search size={16} />
            <input
              placeholder="搜索文章标题或链接"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          
          <VmSelect
            className="vm-note-filter-select"
            value={subscriptionFilterValue}
            onChange={handleSelectSubscription}
            options={subscriptionOptions}
            renderOption={o => <span className="truncate">{o.label ?? o.value}</span>}
          />
        </div>
        
        <div className="vm-note-list">
          {filteredItems.length === 0 ? (
            <div className="vm-article-empty">
              {searchQuery ? '没有找到匹配的文章' : '暂无文章，请新增或抓取'}
            </div>
          ) : (
            filteredItems.map(item => {
              const active = item.id === selectedArticleId
              return (
                <div
                  key={item.id}
                  className={'vm-note-card' + (active ? ' active' : '')}
                  onClick={() => setSelectedArticleId(item.id)}
                >
                  <NoteThumb platform={item.platform} coverUrl={item.cover_url} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="vm-note-card-title">{item.title}</div>
                    <div className="vm-note-card-meta">
                      <Pf id={item.platform} sm />
                      {renderStatus(item.summary_status)}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </aside>

      {/* Right Content Area */}
      <div className="vm-reader" style={{ background: 'var(--vm-bg)' }}>
        {selectedArticleId === null ? (
          /* Create / Add / Fetch Form layout */
          <div className="vm-content-inner narrow vm-fade-up" style={{ paddingBlock: 40 }}>
            <div className="vm-card vm-card-pad" style={{ background: 'var(--vm-surface)' }}>
              <div className="vm-row" style={{ gap: 8, marginBottom: 20 }}>
                <Send size={20} className="text-primary" />
                <span className="vm-sec-title" style={{ fontSize: 18 }}>新增文章内容</span>
              </div>

              {/* Form Option Tabs */}
              <div className="vm-seg" style={{ marginBottom: 20 }}>
                <button
                  className={'vm-seg-item' + (formTab === 'fetch' ? ' active' : '')}
                  onClick={() => setFormTab('fetch')}
                >
                  链接提取
                </button>
                <button
                  className={'vm-seg-item' + (formTab === 'import' ? ' active' : '')}
                  onClick={() => setFormTab('import')}
                >
                  手动导入
                </button>
              </div>

              <div className="vm-col" style={{ gap: 16 }}>
                {formTab === 'fetch' ? (
                  <div className="vm-col" style={{ gap: 14 }}>
                    <div className="vm-col" style={{ gap: 6 }}>
                      <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--vm-muted)' }}>平台来源</label>
                      <VmSelect
                        className="vm-article-select"
                        value={platform}
                        onChange={value => setPlatform(value as ArticlePlatform)}
                        options={platforms.map(item => ({ value: item.value, label: item.label }))}
                      />
                    </div>
                    
                    <div className="vm-col" style={{ gap: 6 }}>
                      <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--vm-muted)' }}>文章链接</label>
                      <input
                        className="vm-input"
                        value={url}
                        onChange={e => setUrl(e.target.value)}
                        placeholder="请输入微信公众号、小红书或普通网页的链接"
                        style={{ height: 44 }}
                      />
                    </div>
                    
                    <button
                      className="vm-btn vm-btn-primary"
                      style={{ height: 44, marginTop: 10 }}
                      disabled={busy}
                      onClick={handleFetch}
                    >
                      <Sparkles size={16} /> 获取文章并解析
                    </button>
                  </div>
                ) : (
                  <div className="vm-col" style={{ gap: 14 }}>
                    <div className="vm-col" style={{ gap: 6 }}>
                      <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--vm-muted)' }}>来源平台 (可选)</label>
                      <VmSelect
                        className="vm-article-select"
                        value={platform}
                        onChange={value => setPlatform(value as ArticlePlatform)}
                        options={platforms.map(item => ({ value: item.value, label: item.label }))}
                      />
                    </div>

                    <div className="vm-col" style={{ gap: 6 }}>
                      <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--vm-muted)' }}>原文链接 (可选)</label>
                      <input
                        className="vm-input"
                        value={url}
                        onChange={e => setUrl(e.target.value)}
                        placeholder="记录文章链接以备后查"
                        style={{ height: 44 }}
                      />
                    </div>

                    <div className="vm-col" style={{ gap: 6 }}>
                      <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--vm-muted)' }}>文章标题 (可选)</label>
                      <input
                        className="vm-input"
                        value={draftTitle}
                        onChange={e => setDraftTitle(e.target.value)}
                        placeholder="请输入文章标题"
                        style={{ height: 44 }}
                      />
                    </div>

                    <div className="vm-col" style={{ gap: 6 }}>
                      <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--vm-muted)' }}>正文内容</label>
                      <textarea
                        className="vm-textarea"
                        rows={8}
                        value={draftContent}
                        onChange={e => setDraftContent(e.target.value)}
                        placeholder="请粘贴要阅读或总结的文章正文..."
                        style={{ padding: 12 }}
                      />
                    </div>

                    <button
                      className="vm-btn vm-btn-outline"
                      style={{ height: 44, marginTop: 10 }}
                      disabled={busy}
                      onClick={handleImport}
                    >
                      <ClipboardPaste size={16} /> 导入正文
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Selected Article Detailed Reader View */
          <div className="vm-content-inner vm-fade-up" style={{ paddingBlock: 24 }}>
            {articleDetailLoading ? (
              <div className="flex h-[300px] items-center justify-center">
                <Loader2 className="animate-spin text-primary" size={28} />
                <span style={{ marginLeft: 10 }}>加载中...</span>
              </div>
            ) : selectedArticleDetail ? (
              <div className="vm-col" style={{ gap: 20 }}>
                {/* Header Metadata */}
                <div>
                  <h2 style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.3, color: 'var(--vm-text)' }}>
                    {selectedArticleDetail.title}
                  </h2>
                  <div className="vm-row vm-faint" style={{ marginTop: 8, fontSize: 13, gap: 12 }}>
                    <span>作者：{selectedArticleDetail.author_name || '未指定'}</span>
                    <span>•</span>
                    <span>来源：{platformLabel(selectedArticleDetail.platform)}</span>
                    {selectedArticleDetail.published_at && (
                      <>
                        <span>•</span>
                        <span>发布时间：{selectedArticleDetail.published_at}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Tab Switcher & Action */}
                <div className="vm-row" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--vm-border)', paddingBottom: 12 }}>
                  <div className="vm-seg">
                    <button
                      className={'vm-seg-item' + (activeTab === 'original' ? ' active' : '')}
                      onClick={() => setActiveTab('original')}
                    >
                      原文内容
                    </button>
                    <button
                      className={'vm-seg-item' + (activeTab === 'ai' ? ' active' : '')}
                      onClick={() => setActiveTab('ai')}
                    >
                      AI 总结
                    </button>
                  </div>
                  {selectedArticleDetail.url && selectedArticleDetail.url.startsWith('http') && (
                    <button
                      className="vm-btn vm-btn-outline vm-btn-sm"
                      onClick={() => window.open(selectedArticleDetail.url, '_blank')}
                    >
                      <ExternalLink size={14} /> 查看原文
                    </button>
                  )}
                </div>

                {/* Tab Contents */}
                {activeTab === 'original' ? (
                  /* Original text view */
                  <div className="vm-article-preview-box" style={{ marginTop: 0 }}>
                    {selectedArticleDetail.content_text ? (
                      renderArticleContent(selectedArticleDetail.content_text)
                    ) : (
                      <div className="vm-faint text-center" style={{ padding: 40 }}>
                        暂时没有原文正文内容。可以尝试点击“AI 总结”触发总结，以使系统重新抓取并保存。
                      </div>
                    )}
                  </div>
                ) : (
                  /* AI Summary tab */
                  <div className="vm-col" style={{ gap: 16 }}>
                    {selectedArticleDetail.summary_status === 'summarized' ? (
                      /* Summarized Markdown Content view */
                      <div className="vm-card" style={{ padding: 24, background: 'var(--vm-surface)' }}>
                        {summaryLoading ? (
                          <div className="flex h-[200px] items-center justify-center">
                            <Loader2 className="animate-spin text-primary" size={24} />
                            <span style={{ marginLeft: 8 }}>加载总结内容...</span>
                          </div>
                        ) : (
                          <div className="markdown-body select-text" style={{ background: 'transparent' }}>
                            <ReactMarkdown remarkPlugins={[gfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                              {summaryContent}
                            </ReactMarkdown>
                          </div>
                        )}
                      </div>
                    ) : selectedArticleDetail.summary_status === 'summarizing' || (polledTask && polledTask.status !== 'SUCCESS' && polledTask.status !== 'FAILED') ? (
                      /* Summarizing Loading state */
                      <div className="vm-card text-center" style={{ padding: '60px 24px', background: 'var(--vm-surface)' }}>
                        <Loader2 className="animate-spin text-primary mx-auto" size={40} />
                        <h3 style={{ fontSize: 18, fontWeight: 800, marginTop: 16 }}>正在利用 AI 提炼和总结文章...</h3>
                        <p className="vm-muted" style={{ marginTop: 8, fontSize: 14 }}>
                          当前状态: {polledTask?.status || '排队中'}。这需要大约几秒钟，请稍候。
                        </p>
                      </div>
                    ) : (
                      /* Summarize Form Settings (pending / failed) */
                      <div className="vm-card vm-card-pad" style={{ background: 'var(--vm-surface)' }}>
                        <div className="vm-col" style={{ gap: 16 }}>
                          <div>
                            <h3 style={{ fontSize: 16, fontWeight: 800 }}>生成 AI 总结笔记</h3>
                            <p className="vm-muted" style={{ fontSize: 13.5, marginTop: 4 }}>
                              利用大语言模型自动提取并生成文章结构化的大纲与精简摘要笔记。
                            </p>
                          </div>
                          
                          {selectedArticleDetail.summary_status === 'failed' && (
                            <div
                              style={{
                                padding: 12,
                                borderRadius: 'var(--vm-radius-sm)',
                                background: 'var(--vm-danger-soft)',
                                color: 'var(--vm-danger)',
                                fontSize: 13,
                              }}
                            >
                              上一次生成总结失败了，请尝试重新生成。
                            </div>
                          )}

                          <div className="vm-col" style={{ gap: 14 }}>
                            <div className="vm-grid-2">
                              <Field label={trVm('model', lang)} en={lang === 'zh' ? 'Model' : '模型'}>
                                {modelList.length > 0 ? (
                                  <VmSelect
                                    value={modelName}
                                    onChange={setModelName}
                                    options={modelList.map((m: any) => ({ value: m.model_name }))}
                                    renderOption={o => (
                                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ color: 'var(--vm-primary)', display: 'grid' }}>
                                          <Bot size={16} />
                                        </span>
                                        {o.value}
                                      </span>
                                    )}
                                  />
                                ) : (
                                  <button
                                    className="vm-btn vm-btn-outline vm-btn-block"
                                    onClick={() => navigate('/settings/model')}
                                  >
                                    {lang === 'zh' ? '请先添加模型' : 'Add a model first'}
                                  </button>
                                )}
                              </Field>
                              <Field label={trVm('noteStyle', lang)} en={lang === 'zh' ? 'Style' : '风格'}>
                                <VmSelect
                                  value={style}
                                  onChange={setStyle}
                                  options={noteStyles.map(s => ({ value: s.value, label: s.label }))}
                                />
                              </Field>
                            </div>


                            <div className="vm-col" style={{ gap: 6 }}>
                              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--vm-muted)' }}>额外自定义提示词 (可选)</label>
                              <textarea
                                className="vm-textarea"
                                rows={3}
                                value={extras}
                                onChange={e => setExtras(e.target.value)}
                                placeholder="输入您对总结的额外指导语（例如：提取核心观点、用英文总结、强调文中的技术细节等）"
                                style={{ padding: 10 }}
                              />
                            </div>

                            <button
                              className="vm-btn vm-btn-primary"
                              style={{ height: 44, marginTop: 8 }}
                              disabled={busy || modelList.length === 0}
                              onClick={handleSummarize}
                            >
                              <Sparkles size={16} /> 开始生成 AI 总结
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="vm-article-empty">未找到文章详情</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
