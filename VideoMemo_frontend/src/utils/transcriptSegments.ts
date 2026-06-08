export interface TranscriptSegmentLike {
  start: number
  end: number
  text: string
  speaker?: string
}

const SENTENCE_END_RE = /(?:[。！？!?；;…]+|\.{2,}|[.!?]+)(?:["'”’）)])?$/
const CJK_RE = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/
const MAX_GAP_SECONDS = 1.2
const MAX_SUBTITLE_CHARS = 42
const MAX_SUBTITLE_DURATION_SECONDS = 8

function cleanText(text: string) {
  return text.replace(/\s+/g, ' ').trim()
}

function shouldJoinWithSpace(left: string, right: string) {
  if (!left || !right) return false
  const last = left[left.length - 1]
  const first = right[0]
  return !CJK_RE.test(last) && !CJK_RE.test(first)
}

function appendText(left: string, right: string) {
  if (!left) return right
  return `${left}${shouldJoinWithSpace(left, right) ? ' ' : ''}${right}`
}

function isSentenceBoundary(text: string) {
  return SENTENCE_END_RE.test(text.trim())
}

function splitTextBySentenceBoundaries(text: string) {
  const parts: string[] = []
  let start = 0

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (!/[。！？!?；;…]/.test(char)) continue

    let end = index + 1
    while (end < text.length && /["'”’）)]/.test(text[end])) {
      end += 1
    }

    const part = cleanText(text.slice(start, end))
    if (part) parts.push(part)
    start = end
  }

  const rest = cleanText(text.slice(start))
  if (rest) parts.push(rest)
  return parts.length ? parts : [text]
}

function splitSegmentBySentenceBoundaries(segment: TranscriptSegmentLike) {
  const parts = splitTextBySentenceBoundaries(segment.text)
  if (parts.length <= 1) return [segment]

  const duration = Math.max(0, segment.end - segment.start)
  const totalChars = parts.reduce((sum, part) => sum + part.length, 0) || 1
  let cursor = segment.start

  return parts.map((part, index) => {
    const isLast = index === parts.length - 1
    const partDuration = isLast ? segment.end - cursor : duration * (part.length / totalChars)
    const end = isLast ? segment.end : cursor + partDuration
    const next = { ...segment, start: cursor, end, text: part }
    cursor = end
    return next
  })
}

function shouldFlushByFallback(segment: TranscriptSegmentLike) {
  const duration = Math.max(0, segment.end - segment.start)
  return segment.text.length >= MAX_SUBTITLE_CHARS || duration >= MAX_SUBTITLE_DURATION_SECONDS
}

export function groupTranscriptSegments(
  segments: TranscriptSegmentLike[] | undefined | null
): TranscriptSegmentLike[] {
  const normalized = (segments || [])
    .flatMap(segment =>
      splitSegmentBySentenceBoundaries({
        ...segment,
        start: Number(segment.start) || 0,
        end: Number(segment.end) || Number(segment.start) || 0,
        text: cleanText(segment.text || ''),
      })
    )
    .filter(segment => segment.text)

  const grouped: TranscriptSegmentLike[] = []
  let current: TranscriptSegmentLike | null = null

  const flush = () => {
    if (!current) return
    grouped.push(current)
    current = null
  }

  for (const segment of normalized) {
    if (!current) {
      current = { ...segment }
    } else {
      const gap = segment.start - current.end
      const speakerChanged =
        !!segment.speaker && !!current.speaker && segment.speaker !== current.speaker

      if (gap > MAX_GAP_SECONDS || speakerChanged) {
        flush()
        current = { ...segment }
      } else {
        current = {
          start: current.start,
          end: Math.max(current.end, segment.end),
          text: appendText(current.text, segment.text),
          speaker: current.speaker === segment.speaker ? current.speaker : undefined,
        }
      }
    }

    if (current && (isSentenceBoundary(current.text) || shouldFlushByFallback(current))) {
      flush()
    }
  }

  flush()
  return grouped
}
