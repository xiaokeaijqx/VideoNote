'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Copy,
  Download,
  BrainCircuit,
  MessageSquare,
  FileText,
  FileType2,
  FileCode2,
  Captions,
  ChevronDown,
  Pencil,
  Sparkles,
  Trash2,
  Send,
  ExternalLink,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { type ExportFormat } from '@/services/note'

interface VersionNote {
  ver_id: string
  model_name?: string
  style?: string
  created_at?: string
  source?: 'generated' | 'manual' | 'repolish' | string
}

interface NoteHeaderProps {
  currentTask?: {
    markdown: VersionNote[] | string
  } | null
  isMultiVersion: boolean
  currentVerId: string
  setCurrentVerId: (id: string) => void
  modelName: string
  style: string
  noteStyles: { value: string; label: string }[]
  onCopy: () => void
  onExport: (format: ExportFormat) => void
  onExportTranscript?: () => void
  createAt?: string | Date
  viewMode: 'map' | 'preview'
  setViewMode: (mode: 'map' | 'preview') => void
  showChat?: false | 'half' | 'full'
  setShowChat?: (mode: false | 'half' | 'full') => void
  showTranscript?: boolean
  setShowTranscript?: (show: boolean) => void
  /** Phase 3: 多版本编辑/润色 */
  onEdit?: () => void
  onRepolish?: () => void
  onDeleteVersion?: (verId: string) => void
  /** 推送到飞书文档 */
  onPushFeishu?: () => void
  feishuUrl?: string
  feishuPushing?: boolean
}

const VERSION_SOURCE_LABEL: Record<string, string> = {
  generated: '初始',
  manual: '编辑',
  repolish: '润色',
}

interface ExportOption {
  key: ExportFormat | 'srt' | 'notion'
  label: string
  desc: string
  icon: JSX.Element
  disabled?: boolean
  badge?: string
}

const EXPORT_OPTIONS: ExportOption[] = [
  {
    key: 'markdown',
    label: 'Markdown',
    desc: '原始 .md 文件，零网络',
    icon: <FileText className="h-4 w-4" />,
  },
  { key: 'pdf', label: 'PDF', desc: '排版好的可打印文档', icon: <FileType2 className="h-4 w-4" /> },
  {
    key: 'word',
    label: 'Word',
    desc: '可继续编辑的 .docx',
    icon: <FileType2 className="h-4 w-4" />,
  },
  {
    key: 'html',
    label: 'HTML',
    desc: '可直接在浏览器打开',
    icon: <FileCode2 className="h-4 w-4" />,
  },
  {
    key: 'srt',
    label: '字幕 SRT',
    desc: '带时间轴的字幕文件',
    icon: <Captions className="h-4 w-4" />,
  },
  {
    key: 'notion',
    label: 'Notion',
    desc: '即将上线',
    icon: <FileText className="h-4 w-4" />,
    disabled: true,
    badge: 'Soon',
  },
]

export function MarkdownHeader({
  currentTask,
  isMultiVersion,
  currentVerId,
  setCurrentVerId,
  modelName,
  style,
  noteStyles,
  onCopy,
  onExport,
  onExportTranscript,
  createAt,
  showChat,
  setShowChat,
  showTranscript,
  setShowTranscript,
  viewMode,
  setViewMode,
  onEdit,
  onRepolish,
  onDeleteVersion,
  onPushFeishu,
  feishuUrl,
  feishuPushing,
}: NoteHeaderProps) {
  const [copied, setCopied] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let timer: NodeJS.Timeout
    if (copied) {
      timer = setTimeout(() => setCopied(false), 2000)
    }
    return () => clearTimeout(timer)
  }, [copied])

  // click-outside 关闭导出菜单
  useEffect(() => {
    if (!exportOpen) return
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [exportOpen])

  const handlePick = (opt: ExportOption) => {
    if (opt.disabled) {
      toast('该导出格式即将上线 🚧', { icon: '🛠️' })
      return
    }
    setExportOpen(false)
    if (opt.key === 'srt') {
      onExportTranscript?.()
      return
    }
    onExport(opt.key as ExportFormat)
  }

  const handleCopy = () => {
    onCopy()
    setCopied(true)
  }

  const styleName = noteStyles.find(v => v.value === style)?.label || style

  const reversedMarkdown: VersionNote[] = Array.isArray(currentTask?.markdown)
    ? [...currentTask!.markdown].reverse()
    : []

  const formatDate = (date: string | Date | undefined) => {
    if (!date) return ''
    const d = typeof date === 'string' ? new Date(date) : date
    if (isNaN(d.getTime())) return ''
    return d
      .toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
      .replace(/\//g, '-')
  }

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-white/95 px-4 py-2 backdrop-blur-sm">
      {/* 左侧区域：版本 + 标签 + 创建时间 */}
      <div className="flex flex-wrap items-center gap-3">
        {isMultiVersion && (
          <>
            <Select value={currentVerId} onValueChange={setCurrentVerId}>
              <SelectTrigger className="h-8 w-[200px] text-sm">
                <div className="flex items-center gap-1.5 truncate">
                  {(() => {
                    const v = (currentTask?.markdown as VersionNote[] | undefined)?.find(
                      x => x.ver_id === currentVerId
                    )
                    const label = v?.source ? VERSION_SOURCE_LABEL[v.source] || v.source : '版本'
                    return `${label} · ${currentVerId.slice(-6)}`
                  })()}
                </div>
              </SelectTrigger>
              <SelectContent>
                {(reversedMarkdown || []).map(v => {
                  const label = v.source ? VERSION_SOURCE_LABEL[v.source] || v.source : '版本'
                  return (
                    <SelectItem key={v.ver_id} value={v.ver_id}>
                      <span className="inline-flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {label}
                        </Badge>
                        <span className="font-mono text-xs text-neutral-500">
                          {v.ver_id.slice(-6)}
                        </span>
                        {v.created_at && (
                          <span className="text-xs text-neutral-400">
                            {formatDate(v.created_at)}
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
            {onDeleteVersion &&
              currentVerId &&
              (currentTask?.markdown as VersionNote[])?.length > 1 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={() => onDeleteVersion(currentVerId)}
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-neutral-400 hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>删除当前版本</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
          </>
        )}

        <Badge variant="secondary" className="bg-pink-100 text-pink-700 hover:bg-pink-200">
          {modelName}
        </Badge>
        <Badge variant="secondary" className="bg-cyan-100 text-cyan-700 hover:bg-cyan-200">
          {styleName}
        </Badge>

        {createAt && (
          <div className="text-muted-foreground text-sm">创建时间: {formatDate(createAt)}</div>
        )}
      </div>

      {/* 右侧操作按钮：ml-auto 保证窗口窄、flex-wrap 换行后依然贴右边 */}
      <div className="ml-auto flex items-center gap-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => {
                  setViewMode(viewMode == 'preview' ? 'map' : 'preview')
                }}
                variant="ghost"
                size="sm"
                className="h-8 px-2"
              >
                <BrainCircuit className="mr-1.5 h-4 w-4" />
                <span className="text-sm">{viewMode == 'preview' ? '思维导图' : 'markdown'}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>思维导图</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {setShowTranscript && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => setShowTranscript(!showTranscript)}
                  variant={showTranscript ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 px-2"
                >
                  <Captions className="mr-1.5 h-4 w-4" />
                  <span className="text-sm">字幕</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{showTranscript ? '收起字幕侧栏' : '展开字幕侧栏'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {onEdit && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={onEdit} variant="ghost" size="sm" className="h-8 px-2">
                  <Pencil className="mr-1.5 h-4 w-4" />
                  <span className="text-sm">编辑</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>手动编辑当前版本，保存后追加新版本</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {onRepolish && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={onRepolish} variant="ghost" size="sm" className="h-8 px-2">
                  <Sparkles className="mr-1.5 h-4 w-4" />
                  <span className="text-sm">润色</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>AI 重新润色：选风格 + 额外指令</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={handleCopy} variant="ghost" size="sm" className="h-8 px-2">
                <Copy className="mr-1.5 h-4 w-4" />
                <span className="text-sm">{copied ? '已复制' : '复制'}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>复制内容</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="relative" ref={exportRef}>
          <Button
            onClick={() => setExportOpen(v => !v)}
            variant="ghost"
            size="sm"
            className="h-8 px-2"
          >
            <Download className="mr-1.5 h-4 w-4" />
            <span className="text-sm">导出</span>
            <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-60" />
          </Button>
          {exportOpen && (
            <div
              className="absolute right-0 z-50 mt-1 w-60 overflow-hidden rounded-md border border-neutral-200 bg-white shadow-lg"
              role="menu"
            >
              {EXPORT_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => handlePick(opt)}
                  disabled={opt.disabled}
                  className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                  role="menuitem"
                >
                  <span className="mt-0.5 text-neutral-500">{opt.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                      {opt.label}
                      {opt.badge && (
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {opt.badge}
                        </Badge>
                      )}
                    </span>
                    <span className="block text-xs text-neutral-500">{opt.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        {onPushFeishu && (
          <>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={onPushFeishu}
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2"
                    disabled={feishuPushing}
                  >
                    <Send className="mr-1.5 h-4 w-4" />
                    <span className="text-sm">
                      {feishuPushing ? '推送中…' : feishuUrl ? '重新推送' : '推送飞书'}
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {feishuUrl ? '重新推送一份到飞书文档' : '把当前笔记推送到飞书文档'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {feishuUrl && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a
                      href={feishuUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-emerald-600 transition-colors hover:bg-emerald-50"
                    >
                      <ExternalLink className="h-4 w-4" />
                      <span>打开飞书</span>
                    </a>
                  </TooltipTrigger>
                  <TooltipContent>在飞书中打开已生成的文档</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </>
        )}
        {setShowChat && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => setShowChat(showChat ? false : 'half')}
                  variant={showChat ? 'default' : 'ghost'}
                  size="sm"
                  className="h-8 px-2"
                >
                  <MessageSquare className="mr-1.5 h-4 w-4" />
                  <span className="text-sm">AI 问答</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>基于笔记内容的 AI 问答</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  )
}
