import JSZip from 'jszip'
import type { Task } from '@/store/taskStore'
import type { Collection } from '@/store/collectionStore'
import { coverCandidates } from '@/utils/cover'

/** 取笔记最新版本的 markdown 文本（兼容 string 与 Markdown[] 两种历史格式）。 */
export function getNoteText(task: Task): string {
  const md = task.markdown
  if (Array.isArray(md)) return md[0]?.content ?? ''
  return md || ''
}

/** 笔记标题：优先视频标题，退化到链接或 id。 */
export function getNoteTitle(task: Task): string {
  return task.audioMeta?.title || task.formData?.video_url || task.id
}

/**
 * 笔记封面地址。走 @/utils/cover 统一解析：本地化路径（/static/covers/...）拼后端源、
 * http 直链改走 image_proxy（桌面端 mixed content 拦截）、https 直链保持直连
 * （配合 `referrerPolicy="no-referrer"`，XHS 等 CDN 接受「无 Referer」请求）。
 */
export function getCoverSrc(task: Task): string {
  return coverCandidates(task.audioMeta?.cover_url)[0] || '/placeholder.png'
}

/** 文件名安全化：去掉非法字符。 */
function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|\n\r]+/g, '_').slice(0, 80) || 'note'
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** 导出合集为 JSON 文件（分享用）。 */
export function exportCollectionJson(collection: Collection, notes: Task[]) {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    collection: {
      name: collection.name,
      description: collection.description,
      tags: collection.tags,
      cover: collection.cover,
    },
    notes: notes.map(t => ({
      title: getNoteTitle(t),
      platform: t.platform,
      video_url: t.formData?.video_url,
      markdown: getNoteText(t),
      createdAt: t.createdAt,
    })),
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
  downloadBlob(blob, `${safeFileName(collection.name)}.json`)
}

/** 把合集内笔记的 markdown 打包成 zip Blob。 */
export async function buildCollectionZipBlob(
  collection: Collection,
  notes: Task[],
): Promise<Blob> {
  const zip = new JSZip()
  const folder = zip.folder(safeFileName(collection.name)) ?? zip

  // 合集说明
  const readme = [
    `# ${collection.name}`,
    '',
    collection.description || '',
    '',
    collection.tags.length ? `标签：${collection.tags.join('、')}` : '',
    '',
    `共 ${notes.length} 篇笔记`,
  ].join('\n')
  folder.file('README.md', readme)

  const used = new Set<string>()
  notes.forEach(note => {
    let base = safeFileName(getNoteTitle(note))
    let name = `${base}.md`
    let i = 1
    while (used.has(name)) name = `${base}-${i++}.md`
    used.add(name)
    folder.file(name, getNoteText(note))
  })

  return zip.generateAsync({ type: 'blob' })
}

/** 直接触发 zip 下载。 */
export async function downloadCollectionZip(collection: Collection, notes: Task[]) {
  const blob = await buildCollectionZipBlob(collection, notes)
  downloadBlob(blob, `${safeFileName(collection.name)}.zip`)
}
