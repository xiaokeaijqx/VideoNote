import { FC, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExternalLink, Eye, Plus, RotateCcw, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTaskStore, type Task } from '@/store/taskStore'
import { Pf, PLATFORMS } from '@/components/design/PlatformAvatar'
import { StatusBadge } from '@/components/design/StatusBadge'
import { EmptyTasksArt } from '@/components/design/animations'
import { trVm, useVmLang } from '@/i18n/redesign'
import { noteStyles } from '@/constant/note.ts'

function statusText(status: string): 'all' | 'RUNNING' | 'SUCCESS' | 'FAILED' {
  if (status === 'SUCCESS') return 'SUCCESS'
  if (status === 'FAILED' || status === 'FAILD') return 'FAILED'
  return 'RUNNING'
}

function platformOf(t: Task): string {
  return (
    (t as any).platform ||
    t.formData?.platform ||
    (t.audioMeta as any)?.platform ||
    ''
  )
}

function formatTime(iso?: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '-'
  const today = new Date()
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  if (sameDay)
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

// 估算进行中任务的步骤进度。后端只给一个粗状态，所以根据状态字符串来推断。
function runningStep(t: Task): { key: string; pct: number } {
  const s = String(t.status).toUpperCase()
  if (s.includes('SUMMAR')) return { key: 'SUMMARIZING', pct: 78 }
  if (s.includes('TRANS')) return { key: 'TRANSCRIBING', pct: 50 }
  if (s.includes('DOWNLOAD')) return { key: 'DOWNLOADING', pct: 30 }
  if (s.includes('PARSE') || s.includes('PARSING')) return { key: 'PARSING', pct: 12 }
  return { key: 'PARSING', pct: 8 }
}

const STEP_LABEL: Record<string, { zh: string; en: string }> = {
  PARSING: { zh: '解析链接', en: 'Parsing' },
  DOWNLOADING: { zh: '下载音频', en: 'Downloading' },
  TRANSCRIBING: { zh: '转写文字', en: 'Transcribing' },
  SUMMARIZING: { zh: '总结内容', en: 'Summarizing' },
}

const TaskList: FC = () => {
  const navigate = useNavigate()
  const lang = useVmLang()
  const tasks = useTaskStore(s => s.tasks)
  const setCurrentTask = useTaskStore(s => s.setCurrentTask)
  const removeTask = useTaskStore(s => s.removeTask)
  const retryTask = useTaskStore(s => s.retryTask)

  const [filter, setFilter] = useState<'all' | 'RUNNING' | 'SUCCESS' | 'FAILED'>('all')

  const counts = useMemo(() => {
    const c = { all: tasks.length, RUNNING: 0, SUCCESS: 0, FAILED: 0 }
    for (const t of tasks) {
      const s = statusText(t.status)
      if (s !== 'all') c[s]++
    }
    return c
  }, [tasks])

  const shown = useMemo(
    () => (filter === 'all' ? tasks : tasks.filter(t => statusText(t.status) === filter)),
    [tasks, filter],
  )

  const handleView = (id: string) => {
    setCurrentTask(id)
    navigate('/')
  }

  const chips: { id: 'all' | 'RUNNING' | 'SUCCESS' | 'FAILED'; label: string; n: number }[] = [
    { id: 'all', label: trVm('all', lang), n: counts.all },
    { id: 'RUNNING', label: trVm('running', lang), n: counts.RUNNING },
    { id: 'SUCCESS', label: trVm('done', lang), n: counts.SUCCESS },
    { id: 'FAILED', label: trVm('failed', lang), n: counts.FAILED },
  ]

  return (
    <div className="vm-content-inner wide vm-fade-up">
      <div className="vm-row" style={{ justifyContent: 'space-between', marginBottom: 18 }}>
        <div className="vm-row" style={{ gap: 8 }}>
          {chips.map(c => (
            <button
              key={c.id}
              onClick={() => setFilter(c.id)}
              className={'vm-chip' + (filter === c.id ? ' on' : '')}
              style={{ height: 38 }}
            >
              {c.label}
              <span className="vm-mono" style={{ fontSize: 12, opacity: 0.7 }}>
                {c.n}
              </span>
            </button>
          ))}
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="vm-card" style={{ padding: '56px 24px', textAlign: 'center' }}>
          <EmptyTasksArt />
          <div style={{ fontSize: 19, fontWeight: 800, marginTop: 8 }}>
            {trVm('emptyTasks', lang)}
          </div>
          <div className="vm-muted" style={{ marginTop: 6, fontSize: 14 }}>
            {trVm('emptyTasksSub', lang)}
          </div>
          <button
            className="vm-btn vm-btn-primary"
            style={{ margin: '20px auto 0' }}
            onClick={() => {
              setCurrentTask(null)
              navigate('/')
            }}
          >
            <Plus size={17} />
            {trVm('emptyTasksCta', lang)}
          </button>
        </div>
      ) : shown.length === 0 ? (
        <div className="vm-card" style={{ padding: '56px 24px', textAlign: 'center' }}>
          <div className="vm-muted" style={{ fontSize: 14 }}>
            {lang === 'zh' ? '当前筛选下没有任务' : 'No tasks under this filter'}
          </div>
        </div>
      ) : (
        <div className="vm-card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="vm-tbl" style={{ minWidth: 920 }}>
              <thead>
                <tr>
                  <th>{trVm('colVideo', lang)}</th>
                  <th>{trVm('colPlatform', lang)}</th>
                  <th>{trVm('colModel', lang)}</th>
                  <th>{trVm('colStatus', lang)}</th>
                  <th style={{ textAlign: 'right' }}>{trVm('colTokens', lang)}</th>
                  <th>{trVm('colStyle', lang)}</th>
                  <th>{trVm('colCreated', lang)}</th>
                  <th style={{ textAlign: 'right' }}>{trVm('colActions', lang)}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(t => {
                  const url = t.formData?.video_url || ''
                  const title = (t.audioMeta as any)?.title || ''
                  const platform = platformOf(t)
                  const styleVal = (t.formData as any)?.style || ''
                  const styleLabel = noteStyles.find(s => s.value === styleVal)?.label || '-'
                  const isRunning = statusText(t.status) === 'RUNNING'
                  const step = isRunning ? runningStep(t) : null
                  return (
                    <tr key={t.id}>
                      <td style={{ maxWidth: 320 }}>
                        <div
                          style={{
                            fontWeight: 700,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {title || (lang === 'zh' ? '未命名笔记' : 'Untitled')}
                        </div>
                        {url ? (
                          <a
                            className="vm-link vm-mono"
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              fontSize: 12,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              maxWidth: 280,
                            }}
                          >
                            <span
                              style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {url}
                            </span>
                            <span style={{ flexShrink: 0, display: 'grid' }}>
                              <ExternalLink size={11} />
                            </span>
                          </a>
                        ) : (
                          <span className="vm-faint vm-mono" style={{ fontSize: 12 }}>
                            {lang === 'zh' ? '本地文件' : 'local file'}
                          </span>
                        )}
                        {step && (
                          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="vm-badge vm-badge-warn" style={{ fontSize: 11 }}>
                              {STEP_LABEL[step.key]?.[lang] || step.key}
                            </span>
                            <div
                              style={{
                                flex: 1,
                                maxWidth: 120,
                                height: 4,
                                background: 'var(--vm-surface-3)',
                                borderRadius: 999,
                                overflow: 'hidden',
                              }}
                            >
                              <i
                                style={{
                                  display: 'block',
                                  height: '100%',
                                  width: `${step.pct}%`,
                                  background: 'var(--vm-primary)',
                                  borderRadius: 999,
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="vm-row" style={{ gap: 8 }}>
                          {platform && <Pf id={platform} sm />}
                          <span style={{ fontSize: 13 }}>
                            {PLATFORMS[platform]?.[lang] || platform || '-'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="vm-badge vm-badge-neutral vm-mono" style={{ fontSize: 11.5 }}>
                          {t.formData?.model_name || '-'}
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={t.status} />
                      </td>
                      <td
                        className="vm-mono"
                        style={{
                          textAlign: 'right',
                          color: t.totalTokens ? 'var(--vm-text)' : 'var(--vm-faint)',
                        }}
                      >
                        {t.totalTokens ? t.totalTokens.toLocaleString() : '—'}
                      </td>
                      <td>
                        <span className="vm-muted" style={{ fontSize: 13 }}>
                          {styleLabel}
                        </span>
                      </td>
                      <td className="vm-muted vm-mono" style={{ fontSize: 12.5 }}>
                        {formatTime(t.createdAt)}
                      </td>
                      <td>
                        <div className="vm-row" style={{ gap: 2, justifyContent: 'flex-end' }}>
                          <button
                            className="vm-icon-btn"
                            title={trVm('view', lang)}
                            onClick={() => handleView(t.id)}
                          >
                            <Eye size={17} />
                          </button>
                          <button
                            className="vm-icon-btn"
                            title={trVm('retry', lang)}
                            onClick={() => {
                              retryTask(t.id)
                              toast.success(lang === 'zh' ? '已重新提交任务' : 'Resubmitted')
                            }}
                          >
                            <RotateCcw size={16} />
                          </button>
                          <button
                            className="vm-icon-btn"
                            title={trVm('del', lang)}
                            onClick={() => {
                              removeTask(t.id)
                              toast.success(lang === 'zh' ? '已删除任务' : 'Removed')
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default TaskList
