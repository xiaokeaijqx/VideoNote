import { FC, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Plus,
  Download,
  Share2,
  Sparkles,
  Trash2,
  Library,
  Pencil,
  Cloud,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { ScrollArea } from '@/components/ui/scroll-area.tsx'
import {
  useCollectionStore,
  buildUngroupedCollection,
  isUngroupedCollection,
} from '@/store/collectionStore'
import { useTaskStore } from '@/store/taskStore'
import {
  buildCollectionZipBlob,
  downloadCollectionZip,
  exportCollectionJson,
  getCoverSrc,
  getNoteText,
  getNoteTitle,
} from '@/utils/collection'
import CollectionDialog from './CollectionDialog'
import NotePickerDialog from './NotePickerDialog'
import FlashcardModal from './FlashcardModal'
import DriveUploadDialog from './DriveUploadDialog'

const CollectionDetail: FC = () => {
  const { id = '' } = useParams()
  const navigate = useNavigate()

  const allCollections = useCollectionStore(s => s.collections)
  const updateCollection = useCollectionStore(s => s.updateCollection)
  const setCollectionNotes = useCollectionStore(s => s.setCollectionNotes)
  const removeNoteFromCollection = useCollectionStore(s => s.removeNoteFromCollection)
  const tasks = useTaskStore(s => s.tasks)
  const setCurrentTask = useTaskStore(s => s.setCurrentTask)

  const isUngrouped = isUngroupedCollection(id)
  // 未分组：每次渲染都从 tasks - 真实合集 计算；真实合集：从 store 查
  const collection = useMemo(() => {
    if (isUngrouped) {
      const allIds = tasks.filter(t => t.status === 'SUCCESS').map(t => t.id)
      return buildUngroupedCollection(allIds, allCollections)
    }
    return allCollections.find(c => c.id === id)
  }, [isUngrouped, id, tasks, allCollections])

  const openNote = (noteId: string) => {
    setCurrentTask(noteId)
    navigate('/')
  }

  const [editOpen, setEditOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [flashOpen, setFlashOpen] = useState(false)
  const [driveOpen, setDriveOpen] = useState(false)

  const notes = useMemo(() => {
    const ids = collection?.noteIds ?? []
    // 按合集内顺序排列
    return ids.map(nid => tasks.find(t => t.id === nid)).filter(Boolean) as typeof tasks
  }, [collection, tasks])

  if (!collection) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-white text-gray-500">
        <div>合集不存在或已被删除</div>
        <Button variant="outline" onClick={() => navigate('/collections')}>
          返回合集列表
        </Button>
      </div>
    )
  }

  const combinedContent = notes
    .map(t => `# ${getNoteTitle(t)}\n\n${getNoteText(t)}`)
    .join('\n\n---\n\n')

  const firstNote = notes[0]
  const providerId = firstNote?.formData?.provider_id
  const modelName = firstNote?.formData?.model_name

  const requireNotes = () => {
    if (notes.length === 0) {
      toast.error('合集内还没有笔记，请先添加')
      return false
    }
    return true
  }

  return (
    <ScrollArea className="h-full bg-white">
      <header className="flex flex-col gap-3 border-b border-neutral-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/collections')}
            className="rounded p-1 text-gray-500 hover:bg-neutral-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          {collection.cover ? (
            <img
              src={collection.cover}
              alt={collection.name}
              className="h-12 w-20 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-12 w-20 items-center justify-center rounded-lg bg-neutral-100 text-neutral-300">
              <Library className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-xl font-semibold text-gray-800">
                {collection.name}
              </span>
              {isUngrouped ? (
                <Badge variant="outline" className="text-[10px] font-normal text-neutral-500">
                  自动
                </Badge>
              ) : (
                <button
                  onClick={() => setEditOpen(true)}
                  className="rounded p-1 text-gray-400 hover:bg-neutral-100 hover:text-gray-700"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>
            {collection.description && (
              <div className="truncate text-sm text-gray-500">{collection.description}</div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {collection.tags.map(tag => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
          <span className="text-sm text-gray-400">{notes.length} 篇笔记</span>
        </div>

        <div className="flex flex-wrap gap-2">
          {!isUngrouped && (
            <Button size="sm" onClick={() => setPickerOpen(true)}>
              <Plus className="h-4 w-4" />
              添加笔记
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => requireNotes() && setFlashOpen(true)}
          >
            <Sparkles className="h-4 w-4" />
            闪卡学习
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              if (!requireNotes()) return
              try {
                await downloadCollectionZip(collection, notes)
                toast.success('已开始下载 ZIP')
              } catch {
                toast.error('打包失败')
              }
            }}
          >
            <Download className="h-4 w-4" />
            下载 ZIP
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => requireNotes() && setDriveOpen(true)}
          >
            <Cloud className="h-4 w-4" />
            推送 Drive
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              exportCollectionJson(collection, notes)
              toast.success('已导出合集 JSON')
            }}
          >
            <Share2 className="h-4 w-4" />
            分享
          </Button>
        </div>
      </header>

      <div>
        {notes.length === 0 ? (
          <div className="flex h-[50vh] flex-col items-center justify-center text-center text-gray-500">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-400">
              <Library className="h-7 w-7" />
            </div>
            <div className="mt-4 text-base font-medium text-gray-700">
              {isUngrouped ? '当前没有未分组的笔记' : '合集还是空的'}
            </div>
            <div className="mt-1 text-sm">
              {isUngrouped
                ? '所有已生成的笔记都已被归入合集；新建笔记后会自动出现在这里。'
                : '点击「添加笔记」从历史笔记中选入'}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 p-6">
            {notes.map(t => (
              <div
                key={t.id}
                onClick={() => openNote(t.id)}
                role="button"
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    openNote(t.id)
                  }
                }}
                className="group flex cursor-pointer items-center gap-3 rounded-lg border border-neutral-200 p-3 hover:border-blue-300 hover:bg-blue-50/40"
              >
                {t.audioMeta?.cover_url ? (
                  <img
                    src={getCoverSrc(t)}
                    alt=""
                    className="h-12 w-20 shrink-0 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-20 shrink-0 items-center justify-center rounded bg-neutral-100 text-neutral-300">
                    <Library className="h-5 w-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-gray-800">
                    {getNoteTitle(t)}
                  </div>
                  <div className="text-xs text-gray-400">
                    {t.platform} · {new Date(t.createdAt).toLocaleDateString()}
                  </div>
                </div>
                {!isUngrouped && (
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      removeNoteFromCollection(collection.id, t.id)
                      toast.success('已移出合集')
                    }}
                    className="rounded p-2 text-gray-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {!isUngrouped && (
        <>
          <CollectionDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            initial={collection}
            onSubmit={input => {
              updateCollection(collection.id, input)
              toast.success('已保存合集')
            }}
          />
          <NotePickerDialog
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            selectedIds={collection.noteIds ?? []}
            onConfirm={ids => {
              setCollectionNotes(collection.id, ids)
              toast.success('已更新合集笔记')
            }}
          />
        </>
      )}
      <FlashcardModal
        open={flashOpen}
        onOpenChange={setFlashOpen}
        content={combinedContent}
        providerId={providerId}
        modelName={modelName}
      />
      <DriveUploadDialog
        open={driveOpen}
        onOpenChange={setDriveOpen}
        filename={`${collection.name || 'collection'}.zip`}
        getBlob={() => buildCollectionZipBlob(collection, notes)}
      />
    </ScrollArea>
  )
}

export default CollectionDetail
