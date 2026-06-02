import request from '@/utils/request'
import toast from 'react-hot-toast'

export const generateNote = async (data: {
  video_url: string
  platform: string
  quality: string
  model_name: string
  provider_id: string
  task_id?: string
  format: Array<string>
  style: string
  extras?: string
  video_understand?: boolean
  video_interval?: number
  grid_size: Array<number>
}) => {
  try {
    console.log('generateNote', data)
    const response = await request.post('/generate_note', data)

    if (!response) {
      if (response.data.msg) {
        toast.error(response.data.msg)
      }
      return null
    }
    toast.success('笔记生成任务已提交！')

    console.log('res', response)
    // 成功提示

    return response
  } catch (e: any) {
    console.error('❌ 请求出错', e)

    // 错误提示
    // toast.error('笔记生成失败，请稍后重试')

    throw e // 抛出错误以便调用方处理
  }
}

export const delete_task = async ({ video_id, platform }) => {
  try {
    const data = {
      video_id,
      platform,
    }
    const res = await request.post('/delete_task', data)


      toast.success('任务已成功删除')
      return res
  } catch (e) {
    toast.error('请求异常，删除任务失败')
    console.error('❌ 删除任务失败:', e)
    throw e
  }
}

export const get_task_status = async (task_id: string) => {
  try {
    // 成功提示

    return await request.get('/task_status/' + task_id)
  } catch (e) {
    console.error('❌ 请求出错', e)

    // 错误提示
    toast.error('笔记生成失败，请稍后重试')

    throw e // 抛出错误以便调用方处理
  }
}

export const controlTask = async (task_id: string, action: 'pause' | 'resume') => {
  return await request.post('/task_control', { task_id, action })
}

export type ExportFormat = 'markdown' | 'pdf' | 'html' | 'word' | 'docx'

// ── 多版本：手动编辑 / AI 润色 / 删版本 ─────────────────────

export interface NoteVersion {
  ver_id: string
  content: string
  style: string
  model_name: string
  source: 'generated' | 'manual' | 'repolish' | string
  created_at: string
}

export interface VersionsResponse {
  task_id: string
  markdown: NoteVersion[]
  current_ver_id: string | null
}

export const updateNote = async (
  taskId: string,
  body: { content: string; style?: string },
): Promise<VersionsResponse> => {
  return await request.patch(`/note/${encodeURIComponent(taskId)}`, body)
}

export const repolishNote = async (
  taskId: string,
  body: { style?: string; extras?: string; provider_id: string; model_name: string },
): Promise<VersionsResponse> => {
  return await request.post(`/note/${encodeURIComponent(taskId)}/repolish`, body, {
    timeout: 180000,
  })
}

export const deleteVersion = async (
  taskId: string,
  verId: string,
): Promise<VersionsResponse> => {
  return await request.delete(
    `/note/${encodeURIComponent(taskId)}/version/${encodeURIComponent(verId)}`,
  )
}

/**
 * 构造导出 URL。后端返回的是二进制文件，不能走 axios（响应拦截器会把 blob 当业务 JSON 解）。
 * 在 dev 下走 vite proxy '/api'，在 Tauri / 生产下走 VITE_API_BASE_URL。
 */
export const getExportNoteUrl = (
  taskId: string,
  format: ExportFormat,
  versionId?: string,
): string => {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '/api'
  const params = new URLSearchParams({ format })
  if (versionId) params.set('version_id', versionId)
  return `${base.replace(/\/$/, '')}/export_note/${encodeURIComponent(taskId)}?${params.toString()}`
}

/**
 * 触发浏览器下载导出文件。markdown 格式如果传入了本地内容，可直接客户端 Blob 下载（零网络）。
 */
export const exportNote = async (
  taskId: string,
  format: ExportFormat,
  opts?: { versionId?: string; clientContent?: string; filename?: string },
): Promise<void> => {
  // 客户端直出 markdown：原本 Header 的「下载 Markdown」逻辑保持零网络
  if (format === 'markdown' && opts?.clientContent !== undefined) {
    const blob = new Blob([opts.clientContent], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${opts.filename || taskId}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    return
  }

  // 其余格式（含没传 clientContent 的 markdown）走后端
  const a = document.createElement('a')
  a.href = getExportNoteUrl(taskId, format, opts?.versionId)
  // 同源下浏览器会按 Content-Disposition 文件名下载；跨域 / Tauri 也兼容
  a.rel = 'noreferrer'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
