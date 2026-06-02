import { FC, useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx'
import { Button } from '@/components/ui/button.tsx'
import { useTaskStore } from '@/store/taskStore'
import { getCoverSrc, getNoteText, getNoteTitle } from '@/utils/collection'

interface IProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedIds: string[]
  onConfirm: (ids: string[]) => void
}

const NotePickerDialog: FC<IProps> = ({ open, onOpenChange, selectedIds, onConfirm }) => {
  const tasks = useTaskStore(s => s.tasks)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (open) setSelected(new Set(selectedIds))
  }, [open, selectedIds])

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const available = tasks.filter(t => getNoteText(t).trim().length > 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        - 钉死 w-[560px]，配合 max-w-[calc(100vw-2rem)] 自适应窄屏；
        - 用 w-[...] 而非 sm:max-w-xl，避免被未知样式 / 主题 bridge 拉宽；
        - 整体加 overflow-hidden 给圆角兜底，但内部用原生滚动避免 Radix viewport 的 display:table 怪问题。
      */}
      <DialogContent className="w-[560px] max-w-[calc(100vw-2rem)] overflow-hidden">
        <DialogHeader>
          <DialogTitle>选择笔记</DialogTitle>
          <DialogDescription>从已生成的历史笔记中勾选加入本合集。</DialogDescription>
        </DialogHeader>

        {available.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">
            还没有可用的笔记，请先在工作区生成笔记。
          </div>
        ) : (
          <div className="w-full max-h-[50vh] overflow-y-auto">
            {/* pr-1 给原生滚动条留 1-2px，避免遮住卡片右边框 */}
            <div className="flex w-full flex-col gap-2 pr-1">
              {available.map(t => {
                const checked = selected.has(t.id)
                return (
                  <button
                    key={t.id}
                    onClick={() => toggle(t.id)}
                    className={
                      'box-border flex w-full min-w-0 items-center gap-3 rounded-lg border p-3 text-left transition-colors ' +
                      (checked
                        ? 'border-blue-400 bg-blue-50'
                        : 'border-neutral-200 hover:bg-neutral-50')
                    }
                  >
                    <div
                      className={
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded border ' +
                        (checked ? 'border-blue-500 bg-blue-500 text-white' : 'border-neutral-300')
                      }
                    >
                      {checked && <Check className="h-3.5 w-3.5" />}
                    </div>
                    {t.audioMeta?.cover_url ? (
                      <img
                        src={getCoverSrc(t)}
                        alt=""
                        referrerPolicy="no-referrer"
                        onError={e => {
                          ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                        }}
                        className="h-10 w-16 shrink-0 rounded object-cover"
                      />
                    ) : null}
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div className="truncate text-sm font-medium text-gray-800">
                        {getNoteTitle(t)}
                      </div>
                      <div className="truncate text-xs text-gray-400">
                        {t.platform} · {new Date(t.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2 sm:flex-nowrap">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="shrink-0">
            取消
          </Button>
          <Button
            onClick={() => {
              onConfirm(Array.from(selected))
              onOpenChange(false)
            }}
            className="shrink-0"
          >
            确定（{selected.size}）
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default NotePickerDialog
