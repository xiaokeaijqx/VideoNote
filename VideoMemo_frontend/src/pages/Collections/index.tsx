import { FC, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Folder, Inbox, MoreVertical, Pencil, Plus, Share2, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  useCollectionStore,
  buildUngroupedCollection,
  isUngroupedCollection,
  type Collection,
} from '@/store/collectionStore'
import { useTaskStore } from '@/store/taskStore'
import ContextMenu, { ContextMenuItem } from '@/components/ContextMenu'
import { exportCollectionJson } from '@/utils/collection'
import CollectionDialog from './CollectionDialog'
import { trVm, useVmLang } from '@/i18n/redesign'

// 给「真实」合集生成一个稳定的彩色封面 —— 用合集 id 派生色相，避免每次刷新换色。
const COVER_PALETTE = ['#6366F1', '#D2682F', '#2F8F6B', '#3B82F6', '#EC4899', '#F59E0B', '#8B5CF6', '#10B981']
const coverColor = (id: string): string => {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return COVER_PALETTE[h % COVER_PALETTE.length]
}

const Collections: FC = () => {
  const navigate = useNavigate()
  const lang = useVmLang()
  const collections = useCollectionStore(s => s.collections)
  const addCollection = useCollectionStore(s => s.addCollection)
  const updateCollection = useCollectionStore(s => s.updateCollection)
  const removeCollection = useCollectionStore(s => s.removeCollection)
  const tasks = useTaskStore(s => s.tasks)

  const ungrouped = useMemo(() => {
    const allIds = tasks.filter(t => t.status === 'SUCCESS').map(t => t.id)
    return buildUngroupedCollection(allIds, collections)
  }, [tasks, collections])

  const displayCollections = useMemo(() => [ungrouped, ...collections], [ungrouped, collections])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Collection | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; collection: Collection } | null>(null)

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }
  const openEdit = (c: Collection) => {
    setEditing(c)
    setDialogOpen(true)
  }
  const handleShare = (c: Collection) => {
    const ids = c.noteIds ?? []
    const notes = tasks.filter(t => ids.includes(t.id))
    exportCollectionJson(c, notes)
    toast.success(lang === 'zh' ? '已导出合集 JSON' : 'Exported collection JSON')
  }
  const menuItems = (c: Collection): ContextMenuItem[] => {
    if (isUngroupedCollection(c.id)) {
      return [{ key: 'share', label: lang === 'zh' ? '分享' : 'Share', icon: <Share2 className="h-4 w-4" />, onClick: () => handleShare(c) }]
    }
    return [
      { key: 'edit', label: lang === 'zh' ? '编辑' : 'Edit', icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(c) },
      { key: 'share', label: lang === 'zh' ? '分享' : 'Share', icon: <Share2 className="h-4 w-4" />, onClick: () => handleShare(c) },
      {
        key: 'delete',
        label: lang === 'zh' ? '删除' : 'Delete',
        icon: <Trash2 className="h-4 w-4" />,
        danger: true,
        onClick: () => {
          removeCollection(c.id)
          toast.success(lang === 'zh' ? '已删除合集' : 'Removed')
        },
      },
    ]
  }

  return (
    <div className="vm-content-inner wide vm-fade-up">
      <div className="vm-row" style={{ justifyContent: 'space-between', marginBottom: 20 }}>
        <div className="vm-muted" style={{ fontSize: 14, whiteSpace: 'nowrap' }}>
          {displayCollections.length} {trVm('collectionsCount', lang)}
        </div>
        <button className="vm-btn vm-btn-primary vm-btn-sm" onClick={openCreate}>
          <Plus size={16} />
          {trVm('newCollection', lang)}
        </button>
      </div>

      <div className="vm-coll-grid">
        {displayCollections.map(c => {
          const isUngrouped = isUngroupedCollection(c.id)
          const color = isUngrouped ? '#94A3B8' : coverColor(c.id)
          const bg = isUngrouped
            ? 'var(--vm-surface-3)'
            : `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 55%, #000))`
          const count = (c.noteIds ?? []).length
          return (
            <div
              key={c.id}
              className="vm-coll-card"
              onClick={() => navigate(`/collections/${c.id}`)}
              onContextMenu={e => {
                e.preventDefault()
                setMenu({ x: e.clientX, y: e.clientY, collection: c })
              }}
            >
              <div
                className="vm-coll-cover"
                style={{ background: bg, color: isUngrouped ? 'var(--vm-faint)' : '#fff' }}
              >
                {c.cover ? (
                  // 绝对定位铺满封面区：容器是 grid + place-items:center（为居中
                  // 文件夹图标），grid 子项的 width/height:100% 在 auto 轨道下解析
                  // 不可靠，图片会按原始尺寸居中而不是撑满
                  <img
                    src={c.cover}
                    alt={c.name}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                  />
                ) : isUngrouped ? (
                  <Inbox size={34} />
                ) : (
                  <Folder size={34} />
                )}
                {!isUngrouped && (
                  <button
                    className="vm-icon-btn"
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      background: 'rgba(0,0,0,.45)',
                      color: '#fff',
                      width: 28,
                      height: 28,
                    }}
                    onClick={e => {
                      e.stopPropagation()
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                      setMenu({ x: rect.right - 140, y: rect.bottom + 4, collection: c })
                    }}
                  >
                    <MoreVertical size={15} />
                  </button>
                )}
              </div>
              <div className="vm-coll-body">
                <div className="vm-row" style={{ justifyContent: 'space-between' }}>
                  <div className="vm-coll-name">{c.name}</div>
                </div>
                <div className="vm-coll-meta">
                  <span className="vm-badge vm-badge-neutral">
                    {count} {trVm('notesCount', lang)}
                  </span>
                  {!isUngrouped &&
                    c.tags.map(tag => (
                      <span
                        key={tag}
                        className="vm-badge"
                        style={{
                          background: 'var(--vm-primary-soft)',
                          color: 'var(--vm-primary-strong)',
                        }}
                      >
                        #{tag}
                      </span>
                    ))}
                  {isUngrouped && (
                    <span className="vm-badge vm-badge-neutral" style={{ fontSize: 10.5 }}>
                      {lang === 'zh' ? '自动' : 'auto'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menu.collection)}
          onClose={() => setMenu(null)}
        />
      )}

      <CollectionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        onSubmit={input => {
          if (editing) {
            updateCollection(editing.id, input)
            toast.success(lang === 'zh' ? '已保存合集' : 'Saved')
          } else {
            addCollection(input)
            toast.success(lang === 'zh' ? '已创建合集' : 'Created')
          }
        }}
      />
    </div>
  )
}

export default Collections
