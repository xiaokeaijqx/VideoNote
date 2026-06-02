import { FC, useEffect, useState } from 'react'
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
import { Label } from '@/components/ui/label.tsx'
import { upsertCustomPlatform, type CustomPlatform } from '@/services/downloader'

interface IProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: CustomPlatform | null
  onSaved: (item: CustomPlatform) => void
}

const CustomPlatformDialog: FC<IProps> = ({ open, onOpenChange, initial, onSaved }) => {
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [match, setMatch] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setKey(initial?.key ?? '')
      setName(initial?.name ?? '')
      setMatch(initial?.match ?? '')
    }
  }, [open, initial])

  const handleSubmit = async () => {
    if (submitting) return
    if (!key.trim() || !name.trim() || !match.trim()) {
      toast.error('标识 / 名称 / 匹配规则都不能为空')
      return
    }
    setSubmitting(true)
    try {
      const saved = await upsertCustomPlatform({
        key: key.trim().toLowerCase(),
        name: name.trim(),
        match: match.trim(),
      })
      onSaved(saved)
      toast.success(initial ? '已更新' : '已添加')
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e?.msg || '保存失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? '编辑自定义平台' : '添加自定义平台'}</DialogTitle>
          <DialogDescription>
            标识用于内部识别 + 存 Cookie；名称是列表显示用的；匹配规则是 URL 子串，命中即视为该平台。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cp-key">标识（key）</Label>
            <Input
              id="cp-key"
              value={key}
              onChange={e => setKey(e.target.value)}
              placeholder="如 vimeo（2~32 位小写字母/数字/下划线/短横）"
              disabled={!!initial}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cp-name">名称</Label>
            <Input
              id="cp-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="如 Vimeo"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cp-match">URL 匹配（子串）</Label>
            <Input
              id="cp-match"
              value={match}
              onChange={e => setMatch(e.target.value)}
              placeholder="如 vimeo.com"
            />
            <p className="text-xs text-gray-500">
              用最稳的域名片段就行（含子域），如 <code>vimeo.com</code> 会同时命中 https://vimeo.com/123 和 player.vimeo.com/...
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default CustomPlatformDialog
