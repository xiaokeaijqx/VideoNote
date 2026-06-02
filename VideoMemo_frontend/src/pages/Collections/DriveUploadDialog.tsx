import { FC, useEffect, useState } from 'react'
import { Loader2, ExternalLink } from 'lucide-react'
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
import {
  getDriveClientId,
  setDriveClientId,
  uploadBlobToDrive,
} from '@/utils/googleDrive'

interface IProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  filename: string
  getBlob: () => Promise<Blob>
}

const DriveUploadDialog: FC<IProps> = ({ open, onOpenChange, filename, getBlob }) => {
  const [clientId, setClientId] = useState('')
  const [uploading, setUploading] = useState(false)
  const [link, setLink] = useState('')

  useEffect(() => {
    if (open) {
      setClientId(getDriveClientId())
      setLink('')
    }
  }, [open])

  const handleUpload = async () => {
    const id = clientId.trim()
    if (!id) {
      toast.error('请先填写 Google OAuth Client ID')
      return
    }
    setDriveClientId(id)
    setUploading(true)
    try {
      const blob = await getBlob()
      const res = await uploadBlobToDrive(blob, filename, id)
      setLink(res.webViewLink || '')
      toast.success('已上传到 Google Drive')
    } catch (e: any) {
      toast.error(e?.message || '上传失败')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>推送到 Google Drive</DialogTitle>
          <DialogDescription>
            将合集打包为 ZIP 上传到你的 Google Drive（仅访问本应用创建的文件）。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="gdrive-client-id">OAuth Client ID</Label>
            <Input
              id="gdrive-client-id"
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              placeholder="xxxxxx.apps.googleusercontent.com"
            />
            <p className="text-xs text-gray-500">
              需在 Google Cloud Console 创建「Web 应用」OAuth 客户端，并把当前站点地址加入
              已获授权的 JavaScript 来源。Client ID 会保存在本地浏览器。
            </p>
          </div>

          {link && (
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
            >
              <ExternalLink className="h-4 w-4" />
              在 Google Drive 中查看
            </a>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button onClick={handleUpload} disabled={uploading}>
            {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
            {uploading ? '上传中…' : '上传'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default DriveUploadDialog
