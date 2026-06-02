import { FC, useEffect, useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Textarea } from '@/components/ui/textarea.tsx'
import { Label } from '@/components/ui/label.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import type { Collection, CollectionInput } from '@/store/collectionStore'

interface IProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: Collection | null
  onSubmit: (input: CollectionInput) => void
}

const MAX_COVER_BYTES = 2 * 1024 * 1024 // 2MB

const CollectionDialog: FC<IProps> = ({ open, onOpenChange, initial, onSubmit }) => {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [cover, setCover] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // 打开时根据 initial 初始化表单
  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '')
      setDescription(initial?.description ?? '')
      setCover(initial?.cover ?? '')
      setTags(initial?.tags ?? [])
      setTagInput('')
    }
  }, [open, initial])

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件')
      return
    }
    if (file.size > MAX_COVER_BYTES) {
      toast.error('封面图请小于 2MB')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setCover(reader.result as string)
    reader.readAsDataURL(file)
  }

  const addTag = () => {
    const t = tagInput.trim()
    if (!t) return
    if (tags.includes(t)) {
      setTagInput('')
      return
    }
    setTags(prev => [...prev, t])
    setTagInput('')
  }

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag()
    } else if (e.key === 'Backspace' && !tagInput && tags.length) {
      setTags(prev => prev.slice(0, -1))
    }
  }

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error('请填写合集名称')
      return
    }
    onSubmit({ name: name.trim(), description: description.trim(), cover, tags })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? '编辑合集' : '新建合集'}</DialogTitle>
          <DialogDescription>填写合集的名称、描述、封面与标签。</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* 封面 */}
          <div className="flex flex-col gap-2">
            <Label>封面</Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleCoverChange}
            />
            <div
              onClick={() => fileRef.current?.click()}
              className="group relative flex h-32 w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-neutral-300 bg-neutral-50 hover:border-blue-400"
            >
              {cover ? (
                <>
                  <img src={cover} alt="封面预览" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation()
                      setCover('')
                    }}
                    className="absolute top-2 right-2 rounded-full bg-black/50 p-1 text-white hover:bg-black/70"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center gap-1 text-neutral-400">
                  <ImagePlus className="h-6 w-6" />
                  <span className="text-xs">点击上传封面（≤2MB）</span>
                </div>
              )}
            </div>
          </div>

          {/* 名称 */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="collection-name">名称</Label>
            <Input
              id="collection-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="例如：机器学习入门"
            />
          </div>

          {/* 描述 */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="collection-desc">描述</Label>
            <Textarea
              id="collection-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="简单描述这个合集的内容…"
              rows={3}
            />
          </div>

          {/* 标签 */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="collection-tags">标签</Label>
            <div className="flex gap-2">
              <Input
                id="collection-tags"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="输入后回车添加"
              />
              <Button type="button" variant="outline" onClick={addTag}>
                添加
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map(tag => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => setTags(prev => prev.filter(t => t !== tag))}
                      className="hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSubmit}>{initial ? '保存' : '创建'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default CollectionDialog
