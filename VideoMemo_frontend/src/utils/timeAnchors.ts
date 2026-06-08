export interface TimeAnchor<T = unknown> {
  seconds: number
  element: T
}

export interface TimedTextSegment {
  start: number
  end: number
  text: string
}

export function parseTimestampSeconds(text: string): number | null {
  const match = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (!match) return null

  const first = Number(match[1])
  const second = Number(match[2])
  const third = match[3] == null ? null : Number(match[3])

  if ([first, second, third ?? 0].some(Number.isNaN)) return null
  if (third == null) return first * 60 + second
  return first * 3600 + second * 60 + third
}

export function findClosestTimeAnchor<T>(
  anchors: TimeAnchor<T>[],
  targetSeconds: number
): TimeAnchor<T> | null {
  if (!anchors.length || !Number.isFinite(targetSeconds)) return null

  return anchors.reduce<TimeAnchor<T> | null>((best, anchor) => {
    if (!Number.isFinite(anchor.seconds)) return best
    if (!best) return anchor

    const currentDistance = Math.abs(anchor.seconds - targetSeconds)
    const bestDistance = Math.abs(best.seconds - targetSeconds)
    if (currentDistance < bestDistance) return anchor
    if (currentDistance === bestDistance && anchor.seconds <= targetSeconds) return anchor
    return best
  }, null)
}

export function formatTimestamp(seconds: number): string {
  const normalized = Math.max(0, Math.floor(seconds || 0))
  const mins = Math.floor(normalized / 60)
  const secs = normalized % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function formatSrtTimestamp(seconds: number): string {
  const normalized = Math.max(0, seconds || 0)
  const hours = Math.floor(normalized / 3600)
  const minutes = Math.floor((normalized % 3600) / 60)
  const wholeSeconds = Math.floor(normalized % 60)
  const milliseconds = Math.round((normalized - Math.floor(normalized)) * 1000)

  return (
    [
      hours.toString().padStart(2, '0'),
      minutes.toString().padStart(2, '0'),
      wholeSeconds.toString().padStart(2, '0'),
    ].join(':') + `,${milliseconds.toString().padStart(3, '0')}`
  )
}

export function serializeSegmentsAsSrt(segments: TimedTextSegment[]): string {
  return segments
    .map((segment, index) => {
      const start = formatSrtTimestamp(segment.start)
      const end = formatSrtTimestamp(Math.max(segment.end, segment.start + 0.5))
      return `${index + 1}\n${start} --> ${end}\n${segment.text.trim()}\n`
    })
    .join('\n')
}
