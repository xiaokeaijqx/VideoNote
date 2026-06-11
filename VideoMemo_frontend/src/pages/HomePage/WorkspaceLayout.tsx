import { FC, MouseEvent, ReactNode, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderPlus, MoreVertical, Plus, Search, Star, StarOff, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTaskStore } from '@/store/taskStore'
import { useCollectionStore } from '@/store/collectionStore'
import { NoteThumb } from '@/components/design/NoteThumb'
import { Pf } from '@/components/design/PlatformAvatar'
import { StatusBadge } from '@/components/design/StatusBadge'
import { VmSelect } from '@/components/design/VmSelect'
import { useVmLang, trVm } from '@/i18n/redesign'
import ContextMenu, { type ContextMenuItem } from '@/components/ContextMenu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  buildFavoritesCollection,
  buildUngroupedCollection,
  type Collection,
} from '@/store/collectionStore'

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
  const removeTask = useTaskStore(s => s.removeTask)
  const favoriteNoteIds = useCollectionStore(s => s.favoriteNoteIds)
  const toggleFavorite = useCollectionStore(s => s.toggleFavorite)
  const removeFavorite = useCollectionStore(s => s.removeFavorite)
  const collections = useCollectionStore(s => s.collections)
  const setCollectionNotes = useCollectionStore(s => s.setCollectionNotes)
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [collectionFilter, setCollectionFilter] = useState('all')
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; taskId: string } | null>(null)

  const collectionFilters = useMemo((): Array<Pick<Collection, 'id' | 'name' | 'noteIds'>> => {
    const successIds = tasks.filter(t => t.status === 'SUCCESS').map(t => t.id)
    return [
      { id: 'all', name: lang === 'zh' ? '全部笔记' : 'All notes', noteIds: tasks.map(t => t.id) },
      buildFavoritesCollection(favoriteNoteIds, tasks.map(t => t.id)),
      buildUngroupedCollection(successIds, collections),
      ...collections,
    ]
  }, [collections, favoriteNoteIds, lang, tasks])

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase()
    const sorted = [...tasks].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    const selected = collectionFilters.find(c => c.id === collectionFilter)
    const allowed = selected && selected.id !== 'all' ? new Set(selected.noteIds) : null
    return sorted.filter(t => {
      if (allowed && !allowed.has(t.id)) return false
      if (!kw) return true
      const title = (t.audioMeta as { title?: string })?.title || ''
      const url = t.formData?.video_url || ''
      return title.toLowerCase().includes(kw) || url.toLowerCase().includes(kw)
    })
  }, [collectionFilter, collectionFilters, q, tasks])

  const handleNew = () => setCurrentTask(null)
  const handleSelect = (id: string) => setCurrentTask(id)

  const handleToggleFavorite = (e: MouseEvent, id: string) => {
    e.stopPropagation()
    const willFav = !favoriteNoteIds.includes(id)
    toggleFavorite(id)
    toast.success(
      willFav
        ? lang === 'zh' ? '已加入收藏' : 'Added to favorites'
        : lang === 'zh' ? '已取消收藏' : 'Removed from favorites',
    )
  }

  const confirmDelete = () => {
    if (!pendingDelete) return
    removeFavorite(pendingDelete) // 同步清理收藏标记，避免残留
    removeTask(pendingDelete)
    setPendingDelete(null)
    toast.success(lang === 'zh' ? '已删除笔记' : 'Note deleted')
  }

  const addToCollection = (collectionId: string, noteId: string) => {
    const c = collections.find(x => x.id === collectionId)
    if (!c) return
    if (c.noteIds.includes(noteId)) {
      toast(lang === 'zh' ? '已在该分组中' : 'Already in this group')
      return
    }
    setCollectionNotes(collectionId, [...c.noteIds, noteId])
    toast.success(lang === 'zh' ? `已加入「${c.name}」` : `Added to "${c.name}"`)
  }

  // 右键菜单项：收藏 / 加入分组(子菜单) / 删除
  const buildMenuItems = (taskId: string): ContextMenuItem[] => {
    const isFav = favoriteNoteIds.includes(taskId)
    const groupChildren: ContextMenuItem[] =
      collections.length > 0
        ? collections.map(c => ({
            key: c.id,
            label: c.name,
            icon: <FolderPlus className="h-4 w-4" />,
            disabled: c.noteIds.includes(taskId),
            onClick: () => addToCollection(c.id, taskId),
          }))
        : [
            {
              key: '__new__',
              label: lang === 'zh' ? '暂无分组，去新建…' : 'No groups — create…',
              onClick: () => navigate('/collections'),
            },
          ]
    return [
      {
        key: 'fav',
        label: isFav
          ? lang === 'zh' ? '取消收藏' : 'Unfavorite'
          : lang === 'zh' ? '收藏' : 'Favorite',
        icon: isFav ? <StarOff className="h-4 w-4" /> : <Star className="h-4 w-4" />,
        onClick: () => {
          toggleFavorite(taskId)
          toast.success(
            isFav
              ? lang === 'zh' ? '已取消收藏' : 'Removed from favorites'
              : lang === 'zh' ? '已加入收藏' : 'Added to favorites',
          )
        },
      },
      {
        key: 'group',
        label: lang === 'zh' ? '加入分组' : 'Add to group',
        icon: <FolderPlus className="h-4 w-4" />,
        children: groupChildren,
      },
      {
        key: 'del',
        label: lang === 'zh' ? '删除' : 'Delete',
        icon: <Trash2 className="h-4 w-4" />,
        danger: true,
        onClick: () => setPendingDelete(taskId),
      },
    ]
  }

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
          <VmSelect
            className="vm-note-filter-select"
            value={collectionFilter}
            onChange={setCollectionFilter}
            options={collectionFilters.map(c => ({
              value: c.id,
              label: `${c.name} (${c.noteIds.length})`,
            }))}
            renderOption={o => <span className="truncate">{o.label ?? o.value}</span>}
          />
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
              const fav = favoriteNoteIds.includes(t.id)
              return (
                <div
                  key={t.id}
                  className={'vm-note-card' + (t.id === currentTaskId ? ' active' : '')}
                  onClick={() => handleSelect(t.id)}
                  onContextMenu={e => {
                    e.preventDefault()
                    setMenu({ x: e.clientX, y: e.clientY, taskId: t.id })
                  }}
                >
                  <NoteThumb platform={platform} coverUrl={meta.cover_url} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="vm-note-card-title">{title}</div>
                    <div className="vm-note-card-meta">
                      <Pf id={platform} sm />
                      <StatusBadge status={t.status} />
                    </div>
                  </div>
                  {/* 右侧独立列：收藏星标在上，更多菜单(⋮)在下 */}
                  <div className="vm-card-actions-col">
                    <button
                      className="vm-card-act vm-card-fav"
                      title={fav ? (lang === 'zh' ? '取消收藏' : 'Unfavorite') : (lang === 'zh' ? '收藏' : 'Favorite')}
                      onClick={e => handleToggleFavorite(e, t.id)}
                    >
                      <Star size={14} strokeWidth={1.5} fill={fav ? '#FBBF24' : 'none'} />
                    </button>
                    <button
                      className="vm-card-act vm-card-more"
                      title={lang === 'zh' ? '更多' : 'More'}
                      onClick={e => {
                        e.stopPropagation()
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        setMenu({ x: r.left, y: r.bottom + 6, taskId: t.id })
                      }}
                    >
                      <MoreVertical size={14} strokeWidth={1.5} />
                    </button>
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

      {/* 卡片右键菜单：收藏 / 加入分组 / 删除 */}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={buildMenuItems(menu.taskId)}
          onClose={() => setMenu(null)}
        />
      )}

      {/* 删除确认弹窗（应用内，兼容桌面端 Tauri） */}
      <Dialog open={pendingDelete !== null} onOpenChange={o => !o && setPendingDelete(null)}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>{lang === 'zh' ? '删除笔记' : 'Delete note'}</DialogTitle>
            <DialogDescription>
              {lang === 'zh'
                ? '删除后不可恢复，确定删除这条笔记吗？'
                : 'This cannot be undone. Delete this note?'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              {lang === 'zh' ? '取消' : 'Cancel'}
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              {lang === 'zh' ? '删除' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default WorkspaceLayout
