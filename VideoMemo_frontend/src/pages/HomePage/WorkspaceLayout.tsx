import { FC, ReactNode, useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { useTaskStore } from '@/store/taskStore'
import { NoteThumb } from '@/components/design/NoteThumb'
import { Pf } from '@/components/design/PlatformAvatar'
import { StatusBadge } from '@/components/design/StatusBadge'
import { useVmLang, trVm } from '@/i18n/redesign'

interface Props {
  Preview: ReactNode
}

/**
 * 选中某条笔记后的工作区视图：左侧设计风格的笔记列表（缩略图 + 平台 + 状态），
 * 右侧把现有的 MarkdownViewer 原样嵌入。不动 Markdown 渲染逻辑。
 */
const WorkspaceLayout: FC<Props> = ({ Preview }) => {
  const lang = useVmLang()
  const tasks = useTaskStore(s => s.tasks)
  const currentTaskId = useTaskStore(s => s.currentTaskId)
  const setCurrentTask = useTaskStore(s => s.setCurrentTask)
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase()
    const sorted = [...tasks].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    if (!kw) return sorted
    return sorted.filter(t => {
      const title = (t.audioMeta as { title?: string })?.title || ''
      const url = t.formData?.video_url || ''
      return title.toLowerCase().includes(kw) || url.toLowerCase().includes(kw)
    })
  }, [tasks, q])

  const handleNew = () => setCurrentTask(null)
  const handleSelect = (id: string) => setCurrentTask(id)

  return (
    <div className="vm-ws">
      <aside className="vm-note-rail">
        <div className="vm-note-rail-head">
          <button className="vm-btn vm-btn-primary vm-btn-block" onClick={handleNew}>
            <Plus size={17} /> {trVm('newNote', lang)}
          </button>
          <div className="vm-note-search">
            <Search size={16} />
            <input
              placeholder={trVm('searchNotes', lang)}
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
        </div>
        <div className="vm-note-list">
          {filtered.length === 0 ? (
            <div
              style={{
                padding: '30px 14px',
                textAlign: 'center',
                color: 'var(--vm-faint)',
                fontSize: 13,
              }}
            >
              {lang === 'zh' ? '没有匹配的笔记' : 'No matching notes'}
            </div>
          ) : (
            filtered.map(t => {
              const meta = (t.audioMeta || {}) as {
                platform?: string
                title?: string
                cover_url?: string
              }
              const platform = t.formData?.platform || meta.platform || 'local'
              const title = meta.title || (lang === 'zh' ? '未命名笔记' : 'Untitled note')
              return (
                <div
                  key={t.id}
                  className={'vm-note-card' + (t.id === currentTaskId ? ' active' : '')}
                  onClick={() => handleSelect(t.id)}
                >
                  <NoteThumb platform={platform} coverUrl={meta.cover_url} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="vm-note-card-title">{title}</div>
                    <div className="vm-note-card-meta">
                      <Pf id={platform} sm />
                      <StatusBadge status={t.status} />
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </aside>

      <div className="vm-reader" style={{ background: 'var(--vm-bg)' }}>
        {Preview}
      </div>
    </div>
  )
}

export default WorkspaceLayout
