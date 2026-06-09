import { useState, useEffect, useRef, useMemo, useCallback, memo, FC } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { Button } from '@/components/ui/button.tsx'
import {
  Copy,
  Download,
  ArrowRight,
  Play,
  ExternalLink,
  Pause,
  PlayCircle,
  Check,
  AudioWaveform,
  Link as LinkIcon,
  Sparkles,
  ListTree,
} from 'lucide-react'
import { GenHero, Spinner } from '@/components/design/animations'
import {
  controlTask,
  exportNote,
  updateNote,
  repolishNote,
  deleteVersion,
  type ExportFormat,
  type NoteVersion,
} from '@/services/note.ts'
import MDEditor from '@uiw/react-md-editor'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  Select as UiSelect,
  SelectContent as UiSelectContent,
  SelectItem as UiSelectItem,
  SelectTrigger as UiSelectTrigger,
  SelectValue as UiSelectValue,
} from '@/components/ui/select'
import { Loader2, Save, X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import Error from '@/components/Lottie/error.tsx'
import Idle from '@/components/Lottie/Idle.tsx'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { atomDark as codeStyle } from 'react-syntax-highlighter/dist/esm/styles/prism'
import Zoom from 'react-medium-image-zoom'
import 'react-medium-image-zoom/dist/styles.css'
import gfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeSlug from 'rehype-slug'
import 'katex/dist/katex.min.css'
import 'github-markdown-css/github-markdown-light.css'
import { ScrollArea } from '@/components/ui/scroll-area.tsx'
import { useTaskStore } from '@/store/taskStore'
import { buildVideoTimestampUrl } from '@/utils/platform'
import { noteStyles } from '@/constant/note.ts'
import { MarkdownHeader } from '@/pages/HomePage/components/MarkdownHeader.tsx'
import TranscriptViewer from '@/pages/HomePage/components/transcriptViewer.tsx'
import MarkmapEditor from '@/pages/HomePage/components/MarkmapComponent.tsx'
import ChatPanel from '@/pages/HomePage/components/ChatPanel.tsx'
import VideoBanner from '@/pages/HomePage/components/VideoBanner.tsx'
import { groupTranscriptSegments } from '@/utils/transcriptSegments'
import {
  findClosestTimeAnchor,
  parseTimestampSeconds,
  serializeSegmentsAsSrt,
} from '@/utils/timeAnchors'

interface VersionNote {
  ver_id: string
  content: string
  style: string
  model_name: string
  created_at?: string
}

interface MarkdownViewerProps {
  content: string | VersionNote[]
  status: 'idle' | 'loading' | 'success' | 'failed'
}

interface OutlineItem {
  id: string
  text: string
  level: number
}

const steps = [
  { label: '解析链接', key: 'PARSING' },
  { label: '下载音频', key: 'DOWNLOADING' },
  { label: '转写文字', key: 'TRANSCRIBING' },
  { label: '总结内容', key: 'SUMMARIZING' },
  { label: '保存完成', key: 'SUCCESS' },
]

function getCacheHint(cache?: string) {
  if (cache === 'transcript') return '已复用同视频字幕缓存，跳过重复转写'
  if (cache === 'platform_subtitle') return '已使用平台字幕，减少音频转写等待'
  return ''
}

function safeDownloadName(name: string | undefined, fallback: string) {
  const cleaned = (name || '').replace(/[\\/:*?"<>|\r\n\t]/g, '').trim()
  return cleaned || fallback
}

const remarkPlugins = [gfm, remarkMath]
const rehypePlugins = [rehypeKatex, rehypeSlug]

function normalizeMarkdownImageBlocks(markdown: string): string {
  return markdown.replace(/(!\[[^\]]*]\([^)]+\))\n(?=!\[[^\]]*]\([^)]+\))/g, '$1\n\n')
}

function getMarkdownChildrenText(children: any): string {
  if (children == null || typeof children === 'boolean') return ''
  if (typeof children === 'string' || typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(getMarkdownChildrenText).join('')
  if (typeof children === 'object' && 'props' in children) {
    return getMarkdownChildrenText(children.props?.children)
  }
  return ''
}

function getTimePropsFromChildren(children: any) {
  const seconds = parseTimestampSeconds(getMarkdownChildrenText(children))
  return seconds == null ? {} : { 'data-vm-time': seconds }
}

/**
 * 构建 ReactMarkdown components 对象，baseURL 用于修正图片路径。
 * videoCtx 提供当前笔记的原始视频链接与平台，用于截图下方的「跳转原片」链接。
 * 使用函数 + useMemo 避免每次渲染都创建新的函数实例。
 */
function createMarkdownComponents(
  baseURL: string,
  videoCtx?: { url?: string; platform?: string },
  onTimeAnchorClick?: (seconds: number) => void
) {
  return {
    h1: ({ children, ...props }: any) => (
      <h1
        className="text-primary my-6 scroll-m-20 text-3xl font-extrabold tracking-tight lg:text-4xl"
        {...getTimePropsFromChildren(children)}
        {...props}
      >
        {children}
      </h1>
    ),
    h2: ({ children, ...props }: any) => (
      <h2
        className="text-primary mt-10 mb-4 scroll-m-20 border-b pb-2 text-2xl font-semibold tracking-tight first:mt-0"
        {...getTimePropsFromChildren(children)}
        {...props}
      >
        {children}
      </h2>
    ),
    h3: ({ children, ...props }: any) => (
      <h3
        className="text-primary mt-8 mb-4 scroll-m-20 text-xl font-semibold tracking-tight"
        {...getTimePropsFromChildren(children)}
        {...props}
      >
        {children}
      </h3>
    ),
    h4: ({ children, ...props }: any) => (
      <h4
        className="text-primary mt-6 mb-2 scroll-m-20 text-lg font-semibold tracking-tight"
        {...getTimePropsFromChildren(children)}
        {...props}
      >
        {children}
      </h4>
    ),
    p: ({ children, ...props }: any) => (
      <p
        className="leading-7 [&:not(:first-child)]:mt-6"
        {...getTimePropsFromChildren(children)}
        {...props}
      >
        {children}
      </p>
    ),
    a: ({ href, children, ...props }: any) => {
      const isOriginLink =
        typeof children[0] === 'string' && (children[0] as string).startsWith('原片 @')

      if (isOriginLink) {
        const timeMatch = (children[0] as string).match(/原片 @ (\d{2}:\d{2})/)
        const timeText = timeMatch ? timeMatch[1] : '原片'
        const seconds = parseTimestampSeconds(timeText)

        return (
          <span className="origin-link my-2 inline-flex" data-vm-time={seconds ?? undefined}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
              onClick={() => {
                if (seconds != null) onTimeAnchorClick?.(seconds)
              }}
              {...props}
            >
              <Play className="h-3.5 w-3.5" />
              <span>原片（{timeText}）</span>
            </a>
          </span>
        )
      }

      // 处理笔记内部锚点链接（如目录跳转）
      if (href?.startsWith('#')) {
        const handleAnchorClick = (e: React.MouseEvent) => {
          e.preventDefault()
          const id = decodeURIComponent(href.slice(1))

          // 1. 优先精确匹配 id
          let target = document.getElementById(id)

          // 2. 精确失败时按 heading 文本模糊匹配
          // LLM 生成的目录锚点可能和 heading 实际文本不完全一致
          //（例如 heading 带 *Content-[00:00]* 后缀，目录链接里没有）
          if (!target) {
            const normalize = (s: string) => s.replace(/[-：:\s*\[\]]/g, '').toLowerCase()
            const search = normalize(id)
            const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6')
            for (const h of headings) {
              const text = h.textContent || ''
              if (normalize(text).includes(search) || search.includes(normalize(text))) {
                target = h
                break
              }
            }
          }

          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' })
          } else {
            toast.error('未找到对应章节')
          }
        }

        return (
          <a
            href={href}
            onClick={handleAnchorClick}
            className="text-primary hover:text-primary/80 inline-flex items-center gap-0.5 font-medium underline underline-offset-4"
            {...props}
          >
            {children}
          </a>
        )
      }

      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:text-primary/80 inline-flex items-center gap-0.5 font-medium underline underline-offset-4"
          {...props}
        >
          {children}
          {href?.startsWith('http') && <ExternalLink className="ml-0.5 inline-block h-3 w-3" />}
        </a>
      )
    },
    img: ({ node, ...props }: any) => {
      let src: string = props.src || ''
      if (src.startsWith('/')) {
        // 本地截图 /static/screenshots/... → 拼后端 baseURL
        src = baseURL + src
      }
      // 外部图片（XHS / B 站 / YouTube CDN）保持原 URL，靠 referrerPolicy="no-referrer"
      // 绕过 CDN 的 Referer 校验。与左侧 NoteThumb 同一招。
      props.src = src

      // 截图的 alt 里带「原片 @ mm:ss」（后端 _insert_screenshots 写入），
      // 据此在图片下方生成「跳转原片对应时间点」的链接。
      const alt: string = props.alt || ''
      const tsMatch = alt.match(/原片 @ (\d{1,2}):(\d{2})/)
      let jumpUrl = ''
      let timeText = ''
      let seconds: number | null = null
      if (tsMatch && videoCtx?.url) {
        timeText = `${tsMatch[1]}:${tsMatch[2]}`
        seconds = parseInt(tsMatch[1], 10) * 60 + parseInt(tsMatch[2], 10)
        jumpUrl = buildVideoTimestampUrl(videoCtx.url, videoCtx.platform, seconds)
      }

      return (
        <div className="my-8 flex flex-col items-center gap-2" data-vm-time={seconds ?? undefined}>
          <Zoom>
            <img
              {...props}
              alt=""
              referrerPolicy="no-referrer"
              className="max-w-full cursor-zoom-in rounded-lg object-contain shadow-md transition-all hover:shadow-lg"
              style={{ maxHeight: '500px', width: 'auto' }}
              onError={e => {
                ;(e.currentTarget as HTMLImageElement).style.opacity = '0.35'
              }}
            />
          </Zoom>
          {jumpUrl && (
            <a
              href={jumpUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={jumpUrl}
              className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
              onClick={() => {
                if (seconds != null) onTimeAnchorClick?.(seconds)
              }}
            >
              <Play className="h-3 w-3" />
              <span>跳转原片（{timeText}）</span>
            </a>
          )}
        </div>
      )
    },
    strong: ({ children, ...props }: any) => (
      <strong className="text-primary font-bold" {...props}>
        {children}
      </strong>
    ),
    li: ({ children, ordered: _ordered, index: _index, node: _node, ...props }: any) => {
      const rawText = String(children)
      const isFakeHeading = /^(\*\*.+\*\*)$/.test(rawText.trim())

      if (isFakeHeading) {
        return (
          <div
            className="text-primary my-4 text-lg font-bold"
            {...getTimePropsFromChildren(children)}
          >
            {children}
          </div>
        )
      }

      return (
        <li className="my-1" {...getTimePropsFromChildren(children)} {...props}>
          {children}
        </li>
      )
    },
    ul: ({ children, ...props }: any) => (
      <ul className="my-6 ml-6 list-disc [&>li]:mt-2" {...props}>
        {children}
      </ul>
    ),
    ol: ({ children, ...props }: any) => (
      <ol className="my-6 ml-6 list-decimal [&>li]:mt-2" {...props}>
        {children}
      </ol>
    ),
    blockquote: ({ children, ...props }: any) => (
      <blockquote
        className="border-primary/20 text-muted-foreground mt-6 border-l-4 pl-4 italic"
        {...props}
      >
        {children}
      </blockquote>
    ),
    code: ({ inline, className, children, ...props }: any) => {
      const match = /language-(\w+)/.exec(className || '')
      const codeContent = String(children).replace(/\n$/, '')

      if (!inline && match) {
        return (
          <div className="group bg-muted relative my-6 overflow-hidden rounded-lg border shadow-sm">
            <div className="bg-muted text-muted-foreground flex items-center justify-between px-4 py-1.5 text-sm font-medium">
              <div>{match[1].toUpperCase()}</div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(codeContent)
                  toast.success('代码已复制')
                }}
                className="bg-background/80 hover:bg-background flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors"
              >
                <Copy className="h-3.5 w-3.5" />
                复制
              </button>
            </div>
            <SyntaxHighlighter
              style={codeStyle}
              language={match[1]}
              PreTag="div"
              className="!bg-muted !m-0 !p-0"
              customStyle={{
                margin: 0,
                padding: '1rem',
                background: 'transparent',
                fontSize: '0.9rem',
              }}
              {...props}
            >
              {codeContent}
            </SyntaxHighlighter>
          </div>
        )
      }

      return (
        <code
          className="bg-muted relative rounded px-[0.3rem] py-[0.2rem] font-mono text-sm"
          {...props}
        >
          {children}
        </code>
      )
    },
    table: ({ children, ...props }: any) => (
      <div className="my-6 w-full overflow-y-auto">
        <table className="w-full border-collapse text-sm" {...props}>
          {children}
        </table>
      </div>
    ),
    th: ({ children, ...props }: any) => (
      <th
        className="border-muted-foreground/20 border px-4 py-2 text-left font-medium [&[align=center]]:text-center [&[align=right]]:text-right"
        {...props}
      >
        {children}
      </th>
    ),
    td: ({ children, ...props }: any) => (
      <td
        className="border-muted-foreground/20 border px-4 py-2 text-left [&[align=center]]:text-center [&[align=right]]:text-right"
        {...props}
      >
        {children}
      </td>
    ),
    hr: ({ ...props }: any) => <hr className="border-muted-foreground/20 my-8" {...props} />,
  }
}

const MarkdownViewer: FC<MarkdownViewerProps> = memo(({ status }) => {
  const [copied, setCopied] = useState(false)
  const [currentVerId, setCurrentVerId] = useState<string>('')
  const [selectedContent, setSelectedContent] = useState<string>('')
  const [modelName, setModelName] = useState<string>('')
  const [style, setStyle] = useState<string>('')
  const [createTime, setCreateTime] = useState<string>('')
  // 确保baseURL没有尾部斜杠
  const baseURL = (
    String(import.meta.env.VITE_API_BASE_URL || '').replace('/api', '') || ''
  ).replace(/\/$/, '')
  const getCurrentTask = useTaskStore.getState().getCurrentTask
  const currentTask = useTaskStore(state => state.getCurrentTask())
  const taskStatus = currentTask?.status || 'PENDING'
  const cacheHint = getCacheHint((currentTask as any)?.cache)
  const retryTask = useTaskStore.getState().retryTask
  const updateTaskContent = useTaskStore(state => state.updateTaskContent)

  // 暂停 / 继续控制
  const summarizeIndex = steps.findIndex(s => s.key === 'SUMMARIZING')
  const currentStepIndex = steps.findIndex(s => s.key === taskStatus)
  const canPause = currentStepIndex >= 0 && currentStepIndex < summarizeIndex
  const isPaused = !!currentTask?.paused

  const handlePause = async () => {
    if (!currentTask) return
    try {
      await controlTask(currentTask.id, 'pause')
      toast.success('已请求暂停，将在当前步骤完成后停止')
    } catch {
      toast.error('暂停失败')
    }
  }
  const handleResume = async () => {
    if (!currentTask) return
    try {
      await controlTask(currentTask.id, 'resume')
      updateTaskContent(currentTask.id, { paused: false })
      toast.success('已继续')
    } catch {
      toast.error('继续失败')
    }
  }
  const isMultiVersion = Array.isArray(currentTask?.markdown)
  const [showChat, setShowChat] = useState<false | 'half' | 'full'>(false)
  const [viewMode, setViewMode] = useState<'map' | 'preview'>('preview')
  const svgRef = useRef<SVGSVGElement>(null)
  const noteContentRef = useRef<HTMLDivElement>(null)
  const [activeTranscriptTime, setActiveTranscriptTime] = useState<number | null>(null)
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [outlineItems, setOutlineItems] = useState<OutlineItem[]>([])

  const highlightNoteElement = useCallback((target: Element) => {
    target.classList.remove('vm-note-time-hit')
    window.requestAnimationFrame(() => {
      target.classList.add('vm-note-time-hit')
      window.setTimeout(() => target.classList.remove('vm-note-time-hit'), 1800)
    })
  }, [])

  const scrollNoteToTime = useCallback(
    (seconds: number) => {
      setActiveTranscriptTime(seconds)
      window.setTimeout(() => {
        const root = noteContentRef.current
        if (!root) return

        const anchors = Array.from(root.querySelectorAll<HTMLElement>('[data-vm-time]'))
          .map(element => ({
            seconds: Number(element.dataset.vmTime),
            element,
          }))
          .filter(anchor => Number.isFinite(anchor.seconds))
        const anchor = findClosestTimeAnchor(anchors, seconds)
        if (!anchor) {
          toast('当前笔记里还没有可定位的时间点', { icon: '⌁' })
          return
        }

        anchor.element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        highlightNoteElement(anchor.element)
      }, 0)
    },
    [highlightNoteElement]
  )

  const handleNoteTimeAnchorClick = useCallback((seconds: number) => {
    setActiveTranscriptTime(seconds)
  }, [])

  const refreshOutline = useCallback(() => {
    const root = noteContentRef.current
    if (!root) {
      setOutlineItems([])
      return
    }

    const headings = Array.from(root.querySelectorAll<HTMLElement>('h1, h2, h3, h4'))
      .map((heading, index) => {
        const text = (heading.textContent || '').trim()
        if (!text) return null
        if (!heading.id) heading.id = `vm-heading-${index}`
        return {
          id: heading.id,
          text,
          level: Number(heading.tagName.slice(1)) || 2,
        }
      })
      .filter(Boolean) as OutlineItem[]

    setOutlineItems(headings)
  }, [])

  const jumpToOutlineItem = useCallback(
    (item: OutlineItem) => {
      const target = noteContentRef.current?.querySelector<HTMLElement>(`#${CSS.escape(item.id)}`)
      if (!target) return
      setOutlineOpen(false)
      window.setTimeout(() => {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
        highlightNoteElement(target)
      }, 0)
    },
    [highlightNoteElement]
  )

  // 缓存 ReactMarkdown components，baseURL / 当前笔记视频信息变化时重建
  const videoUrl = currentTask?.formData?.video_url || ''
  const videoPlatform =
    currentTask?.formData?.platform || (currentTask?.audioMeta as any)?.platform || ''
  const markdownComponents = useMemo(
    () =>
      createMarkdownComponents(
        baseURL,
        { url: videoUrl, platform: videoPlatform },
        handleNoteTimeAnchorClick
      ),
    [baseURL, videoUrl, videoPlatform, handleNoteTimeAnchorClick]
  )

  // 多版本内容处理
  useEffect(() => {
    if (!currentTask) return

    if (!isMultiVersion) {
      setCurrentVerId('') // 清空旧版本 ID
      setModelName(currentTask.formData.model_name)
      setStyle(currentTask.formData.style)
      setCreateTime(currentTask.createdAt)
      setSelectedContent(currentTask?.markdown)
    } else {
      const latestVersion = [...currentTask.markdown].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0]

      if (latestVersion) {
        setCurrentVerId(latestVersion.ver_id)
      }
    }
  }, [currentTask?.id, taskStatus])
  useEffect(() => {
    if (!currentTask || !isMultiVersion) return

    const currentVer = currentTask.markdown.find(v => v.ver_id === currentVerId)
    if (currentVer) {
      setModelName(currentVer.model_name)
      setStyle(currentVer.style)
      setCreateTime(currentVer.created_at || '')
      setSelectedContent(currentVer.content)
    }
  }, [currentVerId, currentTask?.id])

  useEffect(() => {
    const timer = window.setTimeout(refreshOutline, 250)
    return () => window.clearTimeout(timer)
  }, [selectedContent, viewMode, refreshOutline])

  // 处理「知识检索」来的引用跳转：?highlight=<section_title>&t=<seconds>&q=<chunk text>
  // 等 markdown 渲染完后滚到目标位置并短暂高亮，最后清掉 URL 参数避免回放
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    if (!selectedContent) return
    const params = new URLSearchParams(location.search)
    const highlight = params.get('highlight')
    const q = params.get('q')
    if (!highlight && !q) return

    const timer = setTimeout(() => {
      const normalize = (s: string) => s.replace(/[-：:\s*\[\]【】（）()。，,.]/g, '').toLowerCase()

      let target: Element | null = null

      // 1) 先按 section_title 找 heading（旧逻辑，最精准）
      if (highlight) {
        const search = normalize(highlight)
        const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6')
        for (const h of headings) {
          const text = h.textContent || ''
          if (normalize(text).includes(search) || search.includes(normalize(text))) {
            target = h
            break
          }
        }
      }

      // 2) 没找到就拿 chunk 原文片段做文本搜索（适配 transcript / 无 section_title 的源）
      if (!target && q) {
        const snippet = normalize(q).slice(0, 30)
        if (snippet.length >= 6) {
          // 在正文 paragraph / li / blockquote 里逐个匹配
          const nodes = document.querySelectorAll(
            '.wmde-markdown p, .wmde-markdown li, .wmde-markdown blockquote, .markdown-body p, .markdown-body li, .markdown-body blockquote'
          )
          for (const n of nodes) {
            const text = normalize(n.textContent || '')
            if (text.includes(snippet)) {
              target = n
              break
            }
          }
        }
      }

      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
        const el = target as HTMLElement
        const prev = el.style.background
        el.style.transition = 'background 0.6s'
        el.style.background = 'rgba(210,104,47,0.20)'
        setTimeout(() => {
          el.style.background = prev
        }, 1800)
      } else {
        toast('未在当前笔记里找到引用段落，可能内容已更新', { icon: '🔎' })
      }
      navigate(location.pathname, { replace: true })
    }, 400)
    return () => clearTimeout(timer)
  }, [selectedContent, location.search, location.pathname, navigate])
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(selectedContent)
      setCopied(true)
      toast.success('已复制到剪贴板')
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      toast.error('复制失败')
    }
  }
  const alertButton = {
    id: 'alert',
    title: '测试警告',
    content: '⚠️',
    onClick: () => alert('你点击了自定义按钮！'),
  }
  const exportButton = {
    id: 'export',
    title: '导出思维导图',
    content: '⤓',
    onClick: () => {
      const svgEl = svgRef.current
      if (!svgEl) return
      // 同上面的序列化逻辑
      const serializer = new XMLSerializer()
      const source = serializer.serializeToString(svgEl)
      const blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>', source], {
        type: 'image/svg+xml;charset=utf-8',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'mindmap.svg'
      a.click()
      URL.revokeObjectURL(url)
    },
  }
  // ── Phase 3: 编辑 / 重新润色 / 删版本 ───────────────────
  const [editing, setEditing] = useState(false)
  const [editorValue, setEditorValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [repolishOpen, setRepolishOpen] = useState(false)
  const [repolishing, setRepolishing] = useState(false)
  const [repolishStyle, setRepolishStyle] = useState<string>('')
  const [repolishExtras, setRepolishExtras] = useState<string>('')

  const handleEdit = () => {
    setEditorValue(selectedContent)
    setEditing(true)
  }
  const handleEditCancel = () => {
    setEditing(false)
    setEditorValue('')
  }
  const handleEditSave = async () => {
    const task = getCurrentTask()
    if (!task || saving) return
    if (!editorValue.trim()) {
      toast.error('内容不能为空')
      return
    }
    setSaving(true)
    try {
      const res = await updateNote(task.id, { content: editorValue, style: style || undefined })
      updateTaskContent(task.id, { markdown: res.markdown as any })
      if (res.current_ver_id) setCurrentVerId(res.current_ver_id)
      setEditing(false)
      toast.success('已保存为新版本')
    } catch (e: any) {
      toast.error(`保存失败: ${e?.message ?? '未知错误'}`)
    } finally {
      setSaving(false)
    }
  }

  const handleOpenRepolish = () => {
    setRepolishStyle(style || '')
    setRepolishExtras('')
    setRepolishOpen(true)
  }
  const handleRepolishSubmit = async () => {
    const task = getCurrentTask()
    if (!task || repolishing) return
    const provider_id = task.formData?.provider_id
    const model_name = task.formData?.model_name
    if (!provider_id || !model_name) {
      toast.error('当前任务缺少模型配置，无法润色')
      return
    }
    setRepolishing(true)
    try {
      const res = await repolishNote(task.id, {
        style: repolishStyle || undefined,
        extras: repolishExtras || undefined,
        provider_id,
        model_name,
      })
      updateTaskContent(task.id, { markdown: res.markdown as any })
      if (res.current_ver_id) setCurrentVerId(res.current_ver_id)
      setRepolishOpen(false)
      toast.success('润色完成，已生成新版本')
    } catch (e: any) {
      toast.error(`润色失败: ${e?.message ?? '未知错误'}`)
    } finally {
      setRepolishing(false)
    }
  }

  const handleDeleteVersion = async (verId: string) => {
    const task = getCurrentTask()
    if (!task) return
    if (!Array.isArray(task.markdown) || task.markdown.length <= 1) {
      toast.error('至少需要保留一个版本')
      return
    }
    if (!window.confirm('删除该版本？无法撤销。')) return
    try {
      const res = await deleteVersion(task.id, verId)
      updateTaskContent(task.id, { markdown: res.markdown as any })
      if (res.current_ver_id) setCurrentVerId(res.current_ver_id)
      toast.success('版本已删除')
    } catch (e: any) {
      toast.error(`删除失败: ${e?.message ?? '未知错误'}`)
    }
  }

  const handleExport = async (format: ExportFormat) => {
    const task = getCurrentTask()
    if (!task) return
    const name = task.audioMeta?.title || 'note'
    try {
      if (format === 'markdown') {
        // 纯客户端 Blob 下载，零网络
        await exportNote(task.id, 'markdown', {
          clientContent: selectedContent,
          filename: name,
          versionId: currentVerId || undefined,
        })
      } else {
        // 走后端转换，浏览器原生下载
        await exportNote(task.id, format, { versionId: currentVerId || undefined })
        toast.success('正在生成文件并下载...')
      }
    } catch (e) {
      console.error('导出失败:', e)
      toast.error('导出失败')
    }
  }

  const handleExportTranscript = () => {
    const task = getCurrentTask()
    const segments = groupTranscriptSegments(task?.transcript?.segments)
    if (!task || !segments.length) {
      toast.error('当前任务没有可导出的字幕')
      return
    }
    const blob = new Blob([serializeSegmentsAsSrt(segments)], {
      type: 'text/plain;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${safeDownloadName(task.audioMeta?.title, task.id)}.srt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('字幕文件已导出')
  }
  const showTranscriptPane = !!currentTask && showChat !== 'half'

  if (status === 'loading') {
    // 把后端状态映射到新设计的 5 步进度 + GenHero 动画的 stepIndex
    const STEP_DEFS = [
      { key: 'PARSING', zh: '解析链接', icon: <LinkIcon size={18} /> },
      { key: 'DOWNLOADING', zh: '下载音频', icon: <Download size={18} /> },
      { key: 'TRANSCRIBING', zh: '转写文字', icon: <AudioWaveform size={18} /> },
      { key: 'SUMMARIZING', zh: '总结内容', icon: <Sparkles size={18} /> },
      { key: 'SUCCESS', zh: '保存完成', icon: <Check size={18} /> },
    ]
    const normalized = taskStatus === 'SAVING' ? 'SUMMARIZING' : taskStatus
    const idx = Math.max(
      0,
      STEP_DEFS.findIndex(s => s.key === normalized)
    )
    return (
      <div className="vm-content-inner narrow vm-fade-up" style={{ paddingTop: 44 }}>
        <div className="vm-card" style={{ overflow: 'hidden' }}>
          {/* 头部 */}
          <div
            style={{
              padding: '20px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid var(--vm-border)',
            }}
          >
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>
                {isPaused ? '已暂停' : '正在生成笔记'}
              </div>
              <div className="vm-field-hint">
                {isPaused ? '点击「继续」恢复后续步骤' : '可在前三步随时暂停；进入总结后将自动锁定'}
              </div>
            </div>
          </div>

          {/* hero animation */}
          <div style={{ padding: '18px 24px 8px', background: 'var(--vm-surface-2)' }}>
            <GenHero stepIndex={idx} />
          </div>

          {/* stepper */}
          <div style={{ padding: '26px 30px 22px' }}>
            <div className="vm-stepper">
              {STEP_DEFS.map((s, i) => (
                <div
                  key={s.key}
                  className={'vm-step ' + (i < idx ? 'done' : i === idx ? 'active' : '')}
                >
                  {i > 0 && (
                    <div className="vm-step-line">
                      <i style={{ width: i <= idx ? '100%' : '0' }} />
                    </div>
                  )}
                  <div className="vm-step-dot">
                    {i < idx ? (
                      <Check size={20} strokeWidth={3} />
                    ) : i === idx ? (
                      <Spinner size={18} />
                    ) : (
                      s.icon
                    )}
                  </div>
                  <div className="vm-step-label">{s.zh}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 暂停 / 继续 控制 */}
          <div
            style={{
              padding: '18px 24px',
              borderTop: '1px solid var(--vm-border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'var(--vm-surface)',
            }}
          >
            <div className="vm-field-hint" style={{ maxWidth: 360 }}>
              {cacheHint || (!isPaused && !canPause ? '即将完成 — 总结阶段无法暂停' : ' ')}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {isPaused ? (
                <button className="vm-btn vm-btn-primary vm-btn-sm" onClick={handleResume}>
                  <PlayCircle size={16} /> 继续
                </button>
              ) : (
                <button
                  className="vm-btn vm-btn-outline vm-btn-sm"
                  onClick={handlePause}
                  disabled={!canPause}
                >
                  <Pause size={16} /> 暂停
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'idle') {
    return (
      <div className="flex h-full min-h-0 w-full flex-col items-center justify-center space-y-3 text-neutral-500">
        <Idle />
        <div className="text-center">
          <p className="text-lg font-bold">输入视频链接并点击"生成笔记"</p>
          <p className="mt-2 text-xs text-neutral-500">支持哔哩哔哩、YouTube 、抖音等视频平台</p>
        </div>
      </div>
    )
  }

  if (status === 'failed' && !isMultiVersion) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-4 space-y-3">
        <Error />
        <div className="text-center">
          <p className="text-lg font-bold text-red-500">笔记生成失败</p>
          <p className="mt-2 mb-2 text-xs text-red-400">请检查后台或稍后再试</p>

          <Button onClick={() => retryTask(currentTask.id)} size="lg">
            重试
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <MarkdownHeader
        currentTask={currentTask}
        isMultiVersion={isMultiVersion}
        currentVerId={currentVerId}
        setCurrentVerId={setCurrentVerId}
        modelName={modelName}
        style={style}
        noteStyles={noteStyles}
        onCopy={handleCopy}
        onExport={handleExport}
        onExportTranscript={handleExportTranscript}
        onEdit={handleEdit}
        onRepolish={handleOpenRepolish}
        onDeleteVersion={handleDeleteVersion}
        createAt={createTime}
        showChat={showChat}
        setShowChat={setShowChat}
        viewMode={viewMode}
        setViewMode={setViewMode}
      />

      {viewMode === 'map' ? (
        <div className="flex min-h-0 w-full flex-1 overflow-hidden bg-white">
          <div className={'w-full'}>
            <MarkmapEditor
              value={selectedContent}
              onChange={() => {}}
              height="100%" // 根据需求可以设定百分比或固定高度
              title={currentTask?.audioMeta?.title || '思维导图'}
            />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden bg-white py-2">
          {selectedContent && selectedContent !== 'loading' && selectedContent !== 'empty' ? (
            <>
              {showChat === 'full' && currentTask ? (
                <div className="h-full w-full">
                  <ChatPanel taskId={currentTask.id} mode="full" onModeChange={setShowChat} />
                </div>
              ) : (
                <>
                  {editing ? (
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                      <div className="flex items-center justify-between border-b bg-neutral-50/50 px-3 py-2">
                        <span className="text-sm font-medium text-gray-700">
                          编辑笔记 · 保存后会作为新版本追加
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-3"
                            onClick={handleEditCancel}
                            disabled={saving}
                          >
                            <X className="mr-1 h-3.5 w-3.5" /> 取消
                          </Button>
                          <Button
                            size="sm"
                            className="h-8 px-3"
                            onClick={handleEditSave}
                            disabled={saving}
                          >
                            {saving ? (
                              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Save className="mr-1 h-3.5 w-3.5" />
                            )}
                            保存
                          </Button>
                        </div>
                      </div>
                      <div className="min-h-0 flex-1 overflow-hidden" data-color-mode="light">
                        <MDEditor
                          value={editorValue}
                          onChange={v => setEditorValue(v ?? '')}
                          height="100%"
                          preview="live"
                        />
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`vm-note-result-grid ${showTranscriptPane ? '' : 'without-transcript'}`}
                    >
                      <ScrollArea className="vm-note-main-scroll min-w-0">
                        {outlineItems.length > 0 && (
                          <div className="vm-note-outline-bar">
                            <div className="relative">
                              <button
                                type="button"
                                className="vm-note-outline-trigger"
                                onClick={() => setOutlineOpen(open => !open)}
                              >
                                <ListTree className="h-4 w-4" />
                                <span>大纲</span>
                              </button>
                              {outlineOpen && (
                                <div className="vm-note-outline-menu">
                                  {outlineItems.map(item => (
                                    <button
                                      key={item.id}
                                      type="button"
                                      className="vm-note-outline-item"
                                      style={{ paddingLeft: 10 + (item.level - 1) * 12 }}
                                      title={item.text}
                                      onClick={() => jumpToOutlineItem(item)}
                                    >
                                      {item.text}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        <div className="px-2">
                          <VideoBanner
                            audioMeta={currentTask?.audioMeta}
                            videoUrl={currentTask?.formData?.video_url}
                          />
                        </div>
                        <div ref={noteContentRef} className={'markdown-body w-full px-2'}>
                          <ReactMarkdown
                            remarkPlugins={remarkPlugins}
                            rehypePlugins={rehypePlugins}
                            components={markdownComponents}
                          >
                            {normalizeMarkdownImageBlocks(
                              selectedContent.replace(/^>\s*来源链接：[^\n]*\n*/m, '')
                            )}
                          </ReactMarkdown>
                        </div>
                      </ScrollArea>
                      {showTranscriptPane && (
                        <aside className="vm-transcript-pane" aria-label="字幕">
                          <TranscriptViewer
                            activeTime={activeTranscriptTime}
                            onSegmentClick={segment => scrollNoteToTime(segment.start)}
                          />
                        </aside>
                      )}
                    </div>
                  )}
                  {/* 侧边问答模式：markdown + ChatPanel 各占一半 */}
                  {showChat === 'half' && currentTask && (
                    <div className="ml-2 h-full w-1/2 shrink-0">
                      <ChatPanel taskId={currentTask.id} mode="half" onModeChange={setShowChat} />
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <div className="w-[300px] flex-col justify-items-center">
                <div className="bg-primary-light mb-4 flex h-16 w-16 items-center justify-center rounded-full">
                  <ArrowRight className="text-primary h-8 w-8" />
                </div>
                <p className="mb-2 text-neutral-600">输入视频链接并点击"生成笔记"按钮</p>
                <p className="text-xs text-neutral-500">支持哔哩哔哩、YouTube等视频网站</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 重新润色 Dialog */}
      <Dialog open={repolishOpen} onOpenChange={open => !repolishing && setRepolishOpen(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>AI 重新润色</DialogTitle>
            <DialogDescription>
              用现有的转录文本 + 当前模型，按新风格 /
              额外指令重新生成一版笔记，作为新版本追加；原版本保留。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">风格</label>
              <UiSelect value={repolishStyle} onValueChange={setRepolishStyle}>
                <UiSelectTrigger className="w-full">
                  <UiSelectValue placeholder="选择风格" />
                </UiSelectTrigger>
                <UiSelectContent>
                  {noteStyles.map(s => (
                    <UiSelectItem key={s.value} value={s.value}>
                      {s.label}
                    </UiSelectItem>
                  ))}
                </UiSelectContent>
              </UiSelect>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                额外指令（可选）
              </label>
              <Textarea
                value={repolishExtras}
                onChange={e => setRepolishExtras(e.target.value)}
                placeholder="例如：把每节标题改成 emoji 开头；强调技术细节；用第一人称口吻……"
                className="min-h-[88px] text-sm"
                disabled={repolishing}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRepolishOpen(false)} disabled={repolishing}>
              取消
            </Button>
            <Button onClick={handleRepolishSubmit} disabled={repolishing}>
              {repolishing ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  润色中…（最长 2-3 分钟）
                </>
              ) : (
                <>
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  开始润色
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
})

MarkdownViewer.displayName = 'MarkdownViewer'

export default MarkdownViewer
