import { FC, useCallback, useMemo, useRef, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Check,
  ExternalLink,
  Loader2,
  Play,
  RefreshCcw,
  Search,
  Send,
  Sparkles,
  Trash2,
  User as UserIcon,
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useKnowledgeStore } from '@/store/knowledgeStore'
import { useTaskStore } from '@/store/taskStore'
import { useCollectionStore } from '@/store/collectionStore'
import { askAcross, listIndexedTasks, reindexAll, type KnowledgeSource } from '@/services/knowledge'
import { noteStyles } from '@/constant/note'
import { Pf, PLATFORMS, platformLabel } from '@/components/design/PlatformAvatar'
import { Spinner } from '@/components/design/animations'
import { trVm, useVmLang } from '@/i18n/redesign'

/** 一条引用来源 —— 点击可跳回原笔记。 */
const SourceCard: FC<{ source: KnowledgeSource; onJump: () => void; lang: 'zh' | 'en' }> = ({
  source,
  onJump,
  lang,
}) => {
  const title = source.title || (lang === 'zh' ? '(无标题)' : '(untitled)')
  return (
    <div className="vm-src-card" onClick={onJump} title={lang === 'zh' ? '跳到原笔记' : 'Open note'}>
      <div className="vm-row" style={{ justifyContent: 'space-between', gap: 8 }}>
        <span
          style={{
            fontWeight: 700,
            fontSize: 13,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: 'var(--vm-text)',
          }}
        >
          {title}
        </span>
        <span style={{ color: 'var(--vm-faint)', flexShrink: 0, display: 'grid' }}>
          <ExternalLink size={14} />
        </span>
      </div>
      <div className="vm-row" style={{ gap: 7, marginTop: 7, flexWrap: 'wrap' }}>
        {source.platform && <Pf id={source.platform} sm />}
        {source.source_type === 'transcript' && source.start_time !== undefined && (
          <span className="vm-badge vm-badge-neutral vm-mono" style={{ fontSize: 11 }}>
            <Play size={10} />
            {Math.floor(source.start_time)}s
            {source.end_time !== undefined ? `~${Math.floor(source.end_time)}s` : ''}
          </span>
        )}
        {source.source_type === 'markdown' && source.section_title && (
          <span className="vm-muted" style={{ fontSize: 12 }}>· {source.section_title}</span>
        )}
        {source.uploader && (
          <span className="vm-faint" style={{ fontSize: 12 }}>{source.uploader}</span>
        )}
      </div>
      {source.text && (
        <div
          className="vm-muted"
          style={{
            marginTop: 7,
            fontSize: 12,
            lineHeight: 1.5,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {source.text}
        </div>
      )}
    </div>
  )
}

/** 过滤项 —— 模仿原型的 .filter-opt（带方形勾选框）。 */
const FilterOpt: FC<{
  on: boolean
  onClick: () => void
  children: React.ReactNode
  count?: number
}> = ({ on, onClick, children, count }) => (
  <div className={'vm-filter-opt' + (on ? ' on' : '')} onClick={onClick}>
    <span className="vm-chk">{on && <Check size={12} strokeWidth={3} />}</span>
    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {children}
    </span>
    {count !== undefined && (
      <span className="vm-faint vm-mono" style={{ fontSize: 11.5 }}>
        {count}
      </span>
    )}
  </div>
)

const Knowledge: FC = () => {
  const navigate = useNavigate()
  const lang = useVmLang()
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [reindexing, setReindexing] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const messages = useKnowledgeStore(s => s.messages)
  const addMessage = useKnowledgeStore(s => s.addMessage)
  const clearMessages = useKnowledgeStore(s => s.clearMessages)
  const filters = useKnowledgeStore(s => s.filters)
  const setFilters = useKnowledgeStore(s => s.setFilters)
  const resetFilters = useKnowledgeStore(s => s.resetFilters)

  const tasks = useTaskStore(s => s.tasks)
  const setCurrentTask = useTaskStore(s => s.setCurrentTask)
  const collections = useCollectionStore(s => s.collections)

  // 默认模型/供应商：取最近一篇成功生成的笔记里的配置
  const defaultModel = useMemo(() => {
    const successTask = [...tasks]
      .reverse()
      .find(t => t.status === 'SUCCESS' && t.formData?.provider_id && t.formData?.model_name)
    if (!successTask) return null
    return {
      provider_id: successTask.formData.provider_id,
      model_name: successTask.formData.model_name,
    }
  }, [tasks])

  const platformOptions = useMemo(() => {
    const set = new Set<string>()
    tasks.forEach(t => {
      if (t.status === 'SUCCESS' && t.audioMeta?.platform) set.add(t.audioMeta.platform)
    })
    return Array.from(set).sort()
  }, [tasks])

  const styleOptions = useMemo(() => {
    const set = new Set<string>()
    tasks.forEach(t => {
      if (t.status === 'SUCCESS') {
        const s = t.formData?.style
        if (s) set.add(s)
      }
    })
    return Array.from(set).sort().map(value => ({
      value,
      label: noteStyles.find(n => n.value === value)?.label ?? value,
    }))
  }, [tasks])

  const scopedTaskIds = useMemo<string[] | null>(() => {
    const collectionIds = filters.collectionIds ?? []
    const platformsSel = filters.platforms ?? []
    const stylesSel = filters.styles ?? []
    const includeUngrouped = !!filters.includeUngrouped

    const anyFilter =
      collectionIds.length > 0 ||
      includeUngrouped ||
      platformsSel.length > 0 ||
      stylesSel.length > 0 ||
      !!filters.dateFrom ||
      !!filters.dateTo
    if (!anyFilter) return null

    const successTasks = tasks.filter(t => t.status === 'SUCCESS')

    let collectionScope: Set<string> | null = null
    if (collectionIds.length > 0 || includeUngrouped) {
      collectionScope = new Set<string>()
      if (collectionIds.length > 0) {
        collections
          .filter(c => collectionIds.includes(c.id))
          .forEach(c => c.noteIds.forEach(id => collectionScope!.add(id)))
      }
      if (includeUngrouped) {
        const grouped = new Set<string>(collections.flatMap(c => c.noteIds))
        successTasks.forEach(t => {
          if (!grouped.has(t.id)) collectionScope!.add(t.id)
        })
      }
    }

    return successTasks
      .filter(t => {
        if (platformsSel.length > 0 && !platformsSel.includes(t.audioMeta?.platform)) return false
        if (stylesSel.length > 0) {
          const s = t.formData?.style || ''
          if (!stylesSel.includes(s)) return false
        }
        if (filters.dateFrom && t.createdAt < filters.dateFrom) return false
        if (filters.dateTo && t.createdAt > filters.dateTo + 'T23:59:59') return false
        if (collectionScope && !collectionScope.has(t.id)) return false
        return true
      })
      .map(t => t.id)
  }, [filters, tasks, collections])

  const scopeSummary = useMemo(() => {
    if (scopedTaskIds === null) {
      const total = tasks.filter(t => t.status === 'SUCCESS').length
      return lang === 'zh' ? `全库 · ${total} 篇` : `Whole library · ${total}`
    }
    return lang === 'zh' ? `${scopedTaskIds.length} 篇匹配` : `${scopedTaskIds.length} matched`
  }, [scopedTaskIds, tasks, lang])

  const togglePlatform = (p: string) => {
    const cur = filters.platforms ?? []
    setFilters({ platforms: cur.includes(p) ? cur.filter(x => x !== p) : [...cur, p] })
  }
  const toggleCollection = (id: string) => {
    const cur = filters.collectionIds ?? []
    setFilters({ collectionIds: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] })
  }
  const toggleStyle = (s: string) => {
    const cur = filters.styles ?? []
    setFilters({ styles: cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s] })
  }

  const ungroupedCount = useMemo(() => {
    const grouped = new Set<string>(collections.flatMap(c => c.noteIds))
    return tasks.filter(t => t.status === 'SUCCESS' && !grouped.has(t.id)).length
  }, [tasks, collections])

  const jumpToSource = useCallback(
    (source: KnowledgeSource) => {
      setCurrentTask(source.task_id)
      const params = new URLSearchParams()
      if (source.section_title) params.set('highlight', source.section_title)
      if (source.start_time !== undefined) params.set('t', String(source.start_time))
      // 用 chunk 文本前 80 字作为兜底定位目标。section_title 经常对不上 markdown 的真实标题，
      // 比如来自 transcript 的源根本没有 section_title；只要带上原文片段，
      // MarkdownViewer 就能用文本搜索定位到对应段落。
      if (source.text) {
        params.set('q', source.text.replace(/\s+/g, ' ').trim().slice(0, 80))
      }
      const qs = params.toString()
      navigate(`/${qs ? '?' + qs : ''}`)
    },
    [navigate, setCurrentTask],
  )

  const handleSend = useCallback(
    async (value: string) => {
      const question = value.trim()
      if (!question || loading) return
      if (!defaultModel) {
        toast.error(
          lang === 'zh'
            ? '未找到可用的 AI 模型，请先在设置里启用一个供应商和模型'
            : 'No usable AI model — enable a provider and model in Settings',
        )
        return
      }

      addMessage({ role: 'user', content: question })
      setInput('')
      setLoading(true)

      try {
        const history = messages.map(m => ({ role: m.role, content: m.content }))
        const res = await askAcross({
          question,
          history,
          scope: { task_ids: scopedTaskIds },
          provider_id: defaultModel.provider_id,
          model_name: defaultModel.model_name,
        })
        addMessage({ role: 'assistant', content: res.answer, sources: res.sources })
      } catch (e: any) {
        toast.error(
          (lang === 'zh' ? '问答失败: ' : 'Failed: ') + (e?.message ?? (lang === 'zh' ? '未知错误' : 'unknown')),
        )
      } finally {
        setLoading(false)
      }
    },
    [loading, defaultModel, scopedTaskIds, messages, addMessage, lang],
  )

  const handleReindexAll = async () => {
    if (reindexing) return
    // 后端默认只重建「已索引」的任务；如果向量库被清空，那个列表是空的，相当于啥也没建。
    // 这里把所有「成功生成」的笔记 id 显式传过去，绕过该行为：无论现有索引状态如何，
    // 一律按用户当前的笔记库重建一遍，对「索引丢失」场景兜底。
    const allSuccess = tasks.filter(t => t.status === 'SUCCESS').map(t => t.id)
    if (allSuccess.length === 0) {
      toast.error(
        lang === 'zh' ? '当前没有可以索引的成功笔记' : 'No successful notes to index yet',
      )
      return
    }
    setReindexing(true)
    try {
      const res = await reindexAll(allSuccess)
      toast.success(
        lang === 'zh'
          ? `已开始后台重建 ${res.count} 个索引`
          : `Rebuilding ${res.count} indices in background`,
      )
    } catch (e: any) {
      toast.error(
        (lang === 'zh' ? '触发重建失败: ' : 'Reindex failed: ') +
          (e?.message ?? (lang === 'zh' ? '未知错误' : 'unknown')),
      )
    } finally {
      setReindexing(false)
    }
  }

  // 新消息追加后自动滚到底部
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, loading])

  // 进入 Knowledge 页时自检：如果向量库里完全没有索引，但用户已经有成功生成的笔记，
  // 自动后台触发一次全库索引，省去用户「索引被清空 → 手动点重建」这步。
  // 用 sessionStorage 锁，避免反复进出页面反复触发。
  const autoIndexTried = useRef(false)
  useEffect(() => {
    if (autoIndexTried.current) return
    if (sessionStorage.getItem('vm-auto-index-tried') === '1') return
    const allSuccess = tasks.filter(t => t.status === 'SUCCESS').map(t => t.id)
    if (allSuccess.length === 0) return
    autoIndexTried.current = true
    sessionStorage.setItem('vm-auto-index-tried', '1')

    listIndexedTasks()
      .then(res => {
        const indexed = new Set(res.task_ids ?? [])
        const missing = allSuccess.filter(id => !indexed.has(id))
        if (missing.length === 0) return
        // 全部缺失 → 提示「索引为空，正在自动重建」；部分缺失 → 静默补建
        const isFullRebuild = indexed.size === 0
        return reindexAll(missing).then(r => {
          if (isFullRebuild) {
            toast.success(
              lang === 'zh'
                ? `检测到索引为空，正在后台为 ${r.count} 篇笔记建立索引`
                : `Index empty — rebuilding ${r.count} notes in background`,
            )
          }
        })
      })
      .catch(e => {
        // 这是兜底优化，失败就算了；不打扰用户，只打日志
        console.warn('auto reindex on mount failed:', e)
      })
  }, [tasks, lang])

  const examples =
    lang === 'zh'
      ? [
          '这些视频里关于 Skills 的核心观点是什么？',
          '总结数字游民最常见的收入来源',
          '对比几个视频提到的安装步骤差异',
        ]
      : [
          'What are the core points about Skills across these videos?',
          'Summarize common income sources for digital nomads',
          'Compare the install steps mentioned',
        ]

  const askExample = (q: string) => {
    setInput(q)
    handleSend(q)
  }

  return (
    <div className="vm-kn">
      {/* filter rail */}
      <div className="vm-filter-rail">
        <div className="vm-row" style={{ justifyContent: 'space-between', marginBottom: 18 }}>
          <span className="vm-mono vm-faint" style={{ fontSize: 11.5, fontWeight: 700 }}>
            {scopeSummary}
          </span>
          <button
            className="vm-btn vm-btn-ghost vm-btn-sm"
            style={{ height: 28, padding: '0 8px' }}
            onClick={resetFilters}
            title={lang === 'zh' ? '重置筛选' : 'Reset'}
          >
            {lang === 'zh' ? '重置' : 'Reset'}
          </button>
        </div>

        <div className="vm-filter-group">
          <div className="vm-filter-group-label">{lang === 'zh' ? '合集' : 'Collections'}</div>
          <FilterOpt
            on={!!filters.includeUngrouped}
            onClick={() => setFilters({ includeUngrouped: !filters.includeUngrouped })}
            count={ungroupedCount}
          >
            <span className="vm-faint" style={{ fontStyle: 'italic' }}>
              {lang === 'zh' ? '未分组' : 'Ungrouped'}
            </span>
          </FilterOpt>
          {collections.length === 0 ? (
            <div className="vm-faint" style={{ fontSize: 12, padding: '6px 0' }}>
              {lang === 'zh' ? '暂无自建合集' : 'No custom collections yet'}
            </div>
          ) : (
            collections.map(c => (
              <FilterOpt
                key={c.id}
                on={(filters.collectionIds ?? []).includes(c.id)}
                onClick={() => toggleCollection(c.id)}
                count={c.noteIds.length}
              >
                {c.name}
              </FilterOpt>
            ))
          )}
        </div>

        {platformOptions.length > 0 && (
          <div className="vm-filter-group">
            <div className="vm-filter-group-label">{trVm('knPlatform', lang)}</div>
            {platformOptions.map(p => (
              <FilterOpt
                key={p}
                on={(filters.platforms ?? []).includes(p)}
                onClick={() => togglePlatform(p)}
              >
                <span className="vm-row" style={{ gap: 7 }}>
                  <Pf id={p} sm />
                  {PLATFORMS[p]?.[lang] ?? platformLabel(p, lang)}
                </span>
              </FilterOpt>
            ))}
          </div>
        )}

        {styleOptions.length > 0 && (
          <div className="vm-filter-group">
            <div className="vm-filter-group-label">{lang === 'zh' ? '笔记风格' : 'Style'}</div>
            {styleOptions.map(s => (
              <FilterOpt
                key={s.value}
                on={(filters.styles ?? []).includes(s.value)}
                onClick={() => toggleStyle(s.value)}
              >
                {s.label}
              </FilterOpt>
            ))}
          </div>
        )}

        <div className="vm-filter-group">
          <div className="vm-filter-group-label">{lang === 'zh' ? '时间范围' : 'Date range'}</div>
          <input
            type="date"
            className="vm-input"
            style={{ height: 34, fontSize: 13, marginBottom: 8 }}
            value={filters.dateFrom ?? ''}
            onChange={e => setFilters({ dateFrom: e.target.value || undefined })}
            placeholder={lang === 'zh' ? '起始' : 'From'}
          />
          <input
            type="date"
            className="vm-input"
            style={{ height: 34, fontSize: 13 }}
            value={filters.dateTo ?? ''}
            onChange={e => setFilters({ dateTo: e.target.value || undefined })}
            placeholder={lang === 'zh' ? '截止' : 'To'}
          />
        </div>

        <button
          className="vm-btn vm-btn-outline vm-btn-sm vm-btn-block"
          onClick={handleReindexAll}
          disabled={reindexing}
        >
          {reindexing ? <Spinner size={15} /> : <RefreshCcw size={15} />}
          {trVm('knReindex', lang)}
        </button>
      </div>

      {/* chat area */}
      <div className="vm-chat-wrap">
        {messages.length > 0 && (
          <div
            className="vm-row"
            style={{
              padding: '12px 32px',
              borderBottom: '1px solid var(--vm-border)',
              justifyContent: 'flex-end',
              background: 'var(--vm-surface)',
            }}
          >
            <button
              className="vm-btn vm-btn-ghost vm-btn-sm"
              onClick={clearMessages}
              title={lang === 'zh' ? '清空对话' : 'Clear chat'}
            >
              <Trash2 size={14} />
              {lang === 'zh' ? '清空对话' : 'Clear'}
            </button>
          </div>
        )}

        <div className="vm-chat-scroll" ref={scrollRef}>
          <div className="vm-chat-inner">
            {messages.length === 0 && !loading ? (
              <div className="vm-fade-up" style={{ textAlign: 'center', paddingTop: 40 }}>
                <div
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: 18,
                    background: 'var(--vm-primary-soft)',
                    color: 'var(--vm-primary)',
                    display: 'grid',
                    placeItems: 'center',
                    margin: '0 auto 16px',
                  }}
                >
                  <Search size={28} />
                </div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{trVm('knAsk', lang)}</div>
                <div className="vm-muted" style={{ marginTop: 8, fontSize: 14.5 }}>
                  {trVm('knAskSub', lang)}
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    alignItems: 'center',
                    marginTop: 24,
                  }}
                >
                  {examples.map((e, i) => (
                    <button key={i} className="vm-example-chip" onClick={() => askExample(e)}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={'vm-msg vm-fade-up ' + (m.role === 'user' ? 'user' : 'ai')}
                  >
                    <div className={'vm-msg-avatar ' + (m.role === 'user' ? 'user' : 'ai')}>
                      {m.role === 'user' ? <UserIcon size={18} /> : <Sparkles size={18} />}
                    </div>
                    <div className="vm-msg-body">
                      {m.role === 'user' ? (
                        <div className="vm-bubble-user">{m.content}</div>
                      ) : (
                        <>
                          <div className="vm-bubble-ai">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {typeof m.content === 'string' ? m.content : String(m.content)}
                            </ReactMarkdown>
                          </div>
                          {m.sources && m.sources.length > 0 && (() => {
                            // 后端可能从同一篇笔记返回多个 chunk（markdown 段、transcript 片段、meta 各一条），
                            // 这里按 task_id 去重，每篇笔记只展示一张引用卡片，避免视觉重复。
                            const seen = new Set<string>()
                            const unique = m.sources.filter(s => {
                              if (seen.has(s.task_id)) return false
                              seen.add(s.task_id)
                              return true
                            })
                            return (
                              <div className="vm-src-grid">
                                {unique.map((s, j) => (
                                  <SourceCard
                                    key={`${s.task_id}-${j}`}
                                    source={s}
                                    onJump={() => jumpToSource(s)}
                                    lang={lang}
                                  />
                                ))}
                              </div>
                            )
                          })()}
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="vm-msg vm-fade-up ai">
                    <div className="vm-msg-avatar ai">
                      <Sparkles size={18} />
                    </div>
                    <div className="vm-msg-body">
                      <div className="vm-bubble-ai vm-row vm-muted" style={{ gap: 8 }}>
                        <Loader2 size={16} className="vm-spin" />
                        {lang === 'zh' ? '思考中…' : 'Thinking…'}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="vm-composer-wrap">
          <div className="vm-composer">
            <textarea
              rows={1}
              value={input}
              placeholder={
                defaultModel
                  ? trVm('knInputPh', lang)
                  : lang === 'zh'
                    ? '请先在设置中启用一个 AI 模型供应商'
                    : 'Enable an AI provider in Settings first'
              }
              disabled={!defaultModel || loading}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend(input)
                }
              }}
            />
            <button
              className="vm-btn vm-btn-primary"
              style={{ height: 40, width: 40, padding: 0, borderRadius: 'var(--vm-radius-sm)' }}
              disabled={!defaultModel || loading || !input.trim()}
              onClick={() => handleSend(input)}
              title={lang === 'zh' ? '发送' : 'Send'}
            >
              {loading ? <Spinner size={17} /> : <Send size={17} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Knowledge
