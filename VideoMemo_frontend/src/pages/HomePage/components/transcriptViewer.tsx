'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Captions, Copy, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import { ScrollArea } from '@/components/ui/scroll-area.tsx'
import { cn } from '@/lib/utils'
import { useTaskStore } from '@/store/taskStore'
import { groupTranscriptSegments } from '@/utils/transcriptSegments'
import { findClosestTimeAnchor, formatTimestamp, serializeSegmentsAsSrt } from '@/utils/timeAnchors'

interface Segment {
  start: number
  end: number
  text: string
  speaker?: string
}

interface Task {
  transcript?: {
    segments?: Segment[]
  }
  audioMeta?: {
    title?: string
  }
}

interface TranscriptViewerProps {
  activeTime?: number | null
  onSegmentClick?: (segment: Segment) => void
}

const TranscriptViewer = ({ activeTime, onSegmentClick }: TranscriptViewerProps) => {
  const task = useTaskStore(state => state.getCurrentTask()) as Task | null
  const [activeSegment, setActiveSegment] = useState<number | null>(null)
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([])
  const subtitleSegments = useMemo(
    () => groupTranscriptSegments(task?.transcript?.segments),
    [task?.transcript?.segments]
  )

  const handleSegmentClick = (index: number) => {
    const segment = subtitleSegments[index]
    if (!segment) return
    setActiveSegment(index)
    onSegmentClick?.(segment)
  }

  useEffect(() => {
    if (activeTime == null || !subtitleSegments.length) return
    const anchor = findClosestTimeAnchor(
      subtitleSegments.map((segment, index) => ({ seconds: segment.start, element: index })),
      activeTime
    )
    if (!anchor) return

    setActiveSegment(anchor.element)
    segmentRefs.current[anchor.element]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeTime, subtitleSegments])

  const copyTranscript = async () => {
    if (!subtitleSegments.length) return
    const text = subtitleSegments
      .map(segment => `${formatTimestamp(segment.start)} ${segment.text}`)
      .join('\n')
    try {
      await navigator.clipboard.writeText(text)
      toast.success('字幕已复制')
    } catch {
      toast.error('复制字幕失败')
    }
  }

  const exportSrt = () => {
    if (!subtitleSegments.length) return
    const blob = new Blob([serializeSegmentsAsSrt(subtitleSegments)], {
      type: 'text/plain;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const title = task?.audioMeta?.title?.trim() || 'transcript'
    link.href = url
    link.download = `${title}.srt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast.success('字幕文件已导出')
  }

  return (
    <div className="transcript-viewer flex h-full w-full flex-col rounded-md border bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-md bg-neutral-100 text-neutral-700">
          <Captions className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-neutral-900">字幕</h2>
          <p className="text-muted-foreground text-xs">按时间对照阅读</p>
        </div>
        {subtitleSegments.length > 0 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
              title="复制带时间戳字幕"
              onClick={copyTranscript}
            >
              <Copy className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
              title="导出 SRT 字幕"
              onClick={exportSrt}
            >
              <Download className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
      {!subtitleSegments.length ? (
        <div className="text-muted-foreground flex min-h-0 flex-1 items-center justify-center text-sm">
          暂无字幕内容
        </div>
      ) : (
        <>
          <div className="text-muted-foreground mb-3 grid grid-cols-[72px_1fr] gap-2 border-b pb-2 text-xs font-medium">
            <div>时间</div>
            <div>内容</div>
          </div>
          <ScrollArea className="min-h-0 w-full flex-1">
            <div className="space-y-1 pr-2">
              {subtitleSegments.map((segment, index) => (
                <div
                  key={`${segment.start}-${index}`}
                  ref={el => {
                    segmentRefs.current[index] = el
                  }}
                  className={cn(
                    'group grid cursor-pointer grid-cols-[72px_1fr] gap-2 rounded-md p-2 transition-colors hover:bg-slate-50',
                    activeSegment === index && 'bg-slate-100'
                  )}
                  onClick={() => handleSegmentClick(index)}
                >
                  <div className="text-xs text-slate-500">
                    <span>{formatTimestamp(segment.start)}</span>
                  </div>

                  <div className="text-sm leading-relaxed text-slate-700">
                    {segment.speaker && (
                      <span className="mr-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-700">
                        {segment.speaker}
                      </span>
                    )}
                    {segment.text}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </>
      )}

      {subtitleSegments.length > 0 && (
        <div className="mt-4 flex flex-wrap justify-between gap-2 border-t pt-3 text-xs text-slate-500">
          <span>共 {subtitleSegments.length} 条字幕</span>
          <span>
            总时长: {formatTimestamp(subtitleSegments[subtitleSegments.length - 1]?.end || 0)}
          </span>
        </div>
      )}
    </div>
  )
}

export default TranscriptViewer
