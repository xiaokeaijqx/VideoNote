import { FC, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bot,
  CheckCircle2,
  Clock,
  FileStack,
  Image as ImageIcon,
  Link as LinkIcon,
  ListTree,
  Sparkles,
  XCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Pf, PLATFORMS } from '@/components/design/PlatformAvatar'
import { Field } from '@/components/design/Field'
import { Chip } from '@/components/design/Chip'
import { Toggle } from '@/components/design/Toggle'
import { Segmented } from '@/components/design/Segmented'
import { VmSelect } from '@/components/design/VmSelect'
import { Spinner } from '@/components/design/animations'
import { noteStyles, noteFormats } from '@/constant/note.ts'
import { useTaskStore } from '@/store/taskStore'
import { useModelStore } from '@/store/modelStore'
import { detectPlatform } from '@/utils/platform'
import request from '@/utils/request'
import { useVmLang, trVm } from '@/i18n/redesign'

const QUALITIES = [
  { value: 'fast', zh: '快速', en: 'Fast' },
  { value: 'medium', zh: '标准', en: 'Standard' },
  { value: 'slow', zh: '高质量', en: 'Best' },
]

const FORMAT_ICONS: Record<string, JSX.Element> = {
  toc: <ListTree size={14} />,
  link: <LinkIcon size={14} />,
  screenshot: <ImageIcon size={14} />,
  summary: <Sparkles size={14} />,
}

const DEFAULT_FORMATS = ['toc', 'screenshot', 'summary']

const BatchImport: FC = () => {
  const navigate = useNavigate()
  const lang = useVmLang()
  const addPendingTask = useTaskStore(s => s.addPendingTask)
  const { modelList, loadEnabledModels } = useModelStore()

  const [text, setText] = useState('')
  const [modelName, setModelName] = useState('')
  const [style, setStyle] = useState('minimal')
  const [quality, setQuality] = useState('medium')
  const [formats, setFormats] = useState<string[]>(DEFAULT_FORMATS)
  const [vision, setVision] = useState(false)
  const [intervalSec, setIntervalSec] = useState(6)
  const [cols, setCols] = useState(2)
  const [rows, setRows] = useState(2)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadEnabledModels()
  }, [loadEnabledModels])
  useEffect(() => {
    if (!modelName && modelList[0]?.model_name) setModelName(modelList[0].model_name)
  }, [modelList, modelName])

  const parsed = useMemo(() => {
    const lines = Array.from(
      new Set(
        text
          .split('\n')
          .map(s => s.trim())
          .filter(Boolean)
      )
    )
    const valid: { url: string; platform: string }[] = []
    const invalid: string[] = []
    for (const line of lines) {
      const p = detectPlatform(line)
      if (p) valid.push({ url: line, platform: p })
      else invalid.push(line)
    }
    return { valid, invalid, total: lines.length }
  }, [text])

  const toggleFmt = (v: string) =>
    setFormats(f => (f.includes(v) ? f.filter(x => x !== v) : [...f, v]))
  const screenshotEnabled = formats.includes('screenshot')

  const handleSubmit = async () => {
    if (submitting) return
    if (parsed.valid.length === 0) {
      toast.error(lang === 'zh' ? '请粘贴至少一个有效的视频链接' : 'Paste at least one valid link')
      return
    }
    if (!modelName) {
      toast.error(lang === 'zh' ? '请选择模型' : 'Pick a model first')
      return
    }
    const provider_id = (modelList.find((m: any) => m.model_name === modelName) as any)?.provider_id
    if (!provider_id) {
      toast.error(lang === 'zh' ? '未找到该模型对应的供应商' : 'No provider for this model')
      return
    }

    setSubmitting(true)
    let ok = 0
    let fail = 0
    for (const { url, platform } of parsed.valid) {
      // 后端同时需要顶层 link / screenshot 布尔 + format 数组，缺顶层布尔不会下视频，
      // 也就不会有截图和时间戳。
      const payload: any = {
        video_url: url,
        platform,
        quality,
        model_name: modelName,
        provider_id,
        format: formats,
        link: formats.includes('link'),
        screenshot: formats.includes('screenshot'),
        style,
        video_understanding: vision,
        video_interval: intervalSec,
        grid_size: [cols, rows],
      }
      try {
        const data: any = await request.post('/generate_note', payload, {
          suppressToast: true,
        } as any)
        addPendingTask(data.task_id, platform, payload)
        ok++
      } catch (e) {
        console.error('批量提交失败:', url, e)
        fail++
      }
    }
    setSubmitting(false)

    if (ok > 0) {
      toast.success(
        lang === 'zh'
          ? `已提交 ${ok} 个任务${fail ? `，${fail} 个失败` : ''}`
          : `Submitted ${ok}${fail ? ` (${fail} failed)` : ''}`
      )
      setText('')
      navigate('/tasks')
    } else {
      toast.error(lang === 'zh' ? '批量提交失败，请检查链接或模型设置' : 'Batch submit failed')
    }
  }

  return (
    <div className="vm-content-inner wide vm-fade-up">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.35fr 1fr',
          gap: 20,
          alignItems: 'start',
        }}
      >
        {/* LEFT: links + queue */}
        <div className="vm-col" style={{ gap: 20, minWidth: 0 }}>
          <div className="vm-card vm-card-pad">
            <div className="vm-row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
              <div className="vm-row">
                <span className="vm-sec-title">{trVm('links', lang)}</span>
                <span className="vm-sec-en" style={{ marginLeft: 8 }}>
                  {trVm('linksHint', lang)}
                </span>
              </div>
              {parsed.total > 0 && (
                <div className="vm-row" style={{ gap: 10, fontSize: 12.5, fontWeight: 700 }}>
                  <span
                    style={{ color: 'var(--vm-ok)', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <CheckCircle2 size={14} /> {parsed.valid.length} {trVm('valid', lang)}
                  </span>
                  {parsed.invalid.length > 0 && (
                    <span
                      style={{
                        color: 'var(--vm-danger)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <XCircle size={14} /> {parsed.invalid.length} {trVm('invalid', lang)}
                    </span>
                  )}
                </div>
              )}
            </div>
            <textarea
              className="vm-textarea vm-input-mono"
              rows={7}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={
                'https://www.bilibili.com/video/BV...\nhttps://www.youtube.com/watch?v=...'
              }
            />
            {parsed.invalid.length > 0 && (
              <div
                style={{
                  marginTop: 12,
                  padding: '10px 13px',
                  borderRadius: 'var(--vm-radius-sm)',
                  background: 'var(--vm-danger-soft)',
                  color: 'var(--vm-danger)',
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{trVm('willSkip', lang)}</div>
                {parsed.invalid.slice(0, 3).map((u, i) => (
                  <div
                    key={i}
                    style={{
                      opacity: 0.85,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {u}
                  </div>
                ))}
                {parsed.invalid.length > 3 && (
                  <div style={{ opacity: 0.7 }}>… +{parsed.invalid.length - 3}</div>
                )}
              </div>
            )}
          </div>

          {/* queue */}
          <div className="vm-card" style={{ overflow: 'hidden' }}>
            <div
              className="vm-row"
              style={{
                justifyContent: 'space-between',
                padding: '15px 20px',
                borderBottom: '1px solid var(--vm-border)',
              }}
            >
              <div className="vm-row">
                <span className="vm-sec-title">{trVm('queue', lang)}</span>
              </div>
              <span className="vm-badge vm-badge-neutral">{parsed.valid.length}</span>
            </div>
            {parsed.valid.length === 0 ? (
              <div style={{ padding: '46px 20px', textAlign: 'center', color: 'var(--vm-faint)' }}>
                <div style={{ display: 'grid', placeItems: 'center', marginBottom: 10 }}>
                  <FileStack size={30} />
                </div>
                <div style={{ fontSize: 13.5 }}>{trVm('emptyQueue', lang)}</div>
              </div>
            ) : (
              <div>
                {parsed.valid.map((v, i) => (
                  <div
                    key={i}
                    className="vm-row"
                    style={{
                      gap: 12,
                      padding: '12px 20px',
                      borderBottom:
                        i < parsed.valid.length - 1 ? '1px solid var(--vm-border)' : 'none',
                    }}
                  >
                    <span
                      className="vm-mono vm-faint"
                      style={{ width: 22, fontSize: 12, textAlign: 'right' }}
                    >
                      {i + 1}
                    </span>
                    <Pf id={v.platform} sm />
                    <span
                      className="vm-mono vm-grow"
                      style={{
                        fontSize: 12.5,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {v.url}
                    </span>
                    <span className="vm-badge vm-badge-neutral">
                      {PLATFORMS[v.platform]?.[lang] || v.platform}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: shared options (sticky) */}
        <div className="vm-card vm-card-pad" style={{ position: 'sticky', top: 20, minWidth: 0 }}>
          <div className="vm-row" style={{ marginBottom: 16 }}>
            <span className="vm-sec-title">{trVm('options', lang)}</span>
            <span className="vm-sec-en" style={{ marginLeft: 8 }}>
              {lang === 'zh' ? 'applied to all' : '应用到全部'}
            </span>
          </div>
          <Field label={trVm('model', lang)}>
            <VmSelect
              value={modelName}
              onChange={setModelName}
              options={modelList.map((m: any) => ({ value: m.model_name }))}
              renderOption={o => (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--vm-primary)', display: 'grid' }}>
                    <Bot size={16} />
                  </span>
                  {o.value}
                </span>
              )}
              placeholder={lang === 'zh' ? '选择模型' : 'Pick a model'}
            />
          </Field>
          <Field label={trVm('noteStyle', lang)}>
            <VmSelect
              value={style}
              onChange={setStyle}
              options={noteStyles.map(s => ({ value: s.value, label: s.label }))}
            />
          </Field>
          <Field label={trVm('quality', lang)}>
            <Segmented
              value={quality}
              onChange={setQuality}
              options={QUALITIES.map(q => ({ value: q.value, label: q[lang] }))}
            />
          </Field>
          <Field label={trVm('contents', lang)}>
            <div className="vm-chip-row">
              {noteFormats.map(f => {
                const on = formats.includes(f.value)
                return (
                  <Chip key={f.value} on={on} onClick={() => toggleFmt(f.value)}>
                    <span
                      style={{
                        display: 'grid',
                        color: on ? 'var(--vm-primary)' : 'var(--vm-faint)',
                      }}
                    >
                      {FORMAT_ICONS[f.value]}
                    </span>
                    {f.label}
                  </Chip>
                )
              })}
            </div>
            {screenshotEnabled && (
              <div className="vm-screenshot-note vm-fade-up">
                <div className="vm-row" style={{ gap: 8, alignItems: 'center' }}>
                  <Clock size={14} />
                  <span className="vm-field-label">{trVm('screenshotImpactTitle', lang)}</span>
                </div>
                <div className="vm-field-hint">{trVm('screenshotBatchHint', lang)}</div>
                <div className="vm-field-hint">{trVm('screenshotLongHint', lang)}</div>
              </div>
            )}
          </Field>

          <Field label={trVm('videoUnd', lang)}>
            <div className="vm-row" style={{ justifyContent: 'space-between' }}>
              <span className="vm-field-hint">{trVm('videoUndHint', lang)}</span>
              <Toggle on={vision} onClick={() => setVision(v => !v)} />
            </div>
            {vision && (
              <div className="vm-grid-2" style={{ marginTop: 12 }}>
                <input
                  className="vm-input"
                  type="number"
                  min={1}
                  max={30}
                  value={intervalSec}
                  onChange={e => setIntervalSec(+e.target.value || 6)}
                  title={trVm('interval', lang)}
                />
                <div className="vm-row">
                  <input
                    className="vm-input"
                    style={{ width: 72 }}
                    type="number"
                    value={cols}
                    onChange={e => setCols(+e.target.value || 2)}
                  />
                  <span className="vm-muted">×</span>
                  <input
                    className="vm-input"
                    style={{ width: 72 }}
                    type="number"
                    value={rows}
                    onChange={e => setRows(+e.target.value || 2)}
                  />
                </div>
              </div>
            )}
          </Field>

          <button
            className="vm-btn vm-btn-primary vm-btn-lg vm-btn-block"
            style={{ marginTop: 6 }}
            disabled={parsed.valid.length === 0 || submitting}
            onClick={handleSubmit}
          >
            {submitting ? <Spinner size={18} /> : <FileStack size={18} />}
            {trVm('batchGen', lang)} ({parsed.valid.length})
          </button>
        </div>
      </div>
    </div>
  )
}

export default BatchImport
