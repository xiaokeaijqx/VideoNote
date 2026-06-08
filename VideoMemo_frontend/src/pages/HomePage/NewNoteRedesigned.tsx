import { FC, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Check,
  CheckCircle2,
  Clock,
  Download,
  Image as ImageIcon,
  Link as LinkIcon,
  ListTree,
  Pause as PauseIcon,
  Play,
  Plus,
  Sparkles,
  Upload,
  X as XIcon,
  AudioWaveform,
  ArrowRight,
  Bot,
  Newspaper,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { generateNote } from '@/services/note.ts'
import { uploadFile } from '@/services/upload.ts'
import { useTaskStore } from '@/store/taskStore'
import { useModelStore } from '@/store/modelStore'
import { noteStyles, noteFormats } from '@/constant/note.ts'
import { detectPlatform, getCustomPlatforms, setCustomPlatforms } from '@/utils/platform'
import { listCustomPlatforms } from '@/services/downloader'
import { Pf, PLATFORMS } from '@/components/design/PlatformAvatar'
import { Field } from '@/components/design/Field'
import { Chip } from '@/components/design/Chip'
import { Toggle } from '@/components/design/Toggle'
import { Segmented } from '@/components/design/Segmented'
import { VmSelect } from '@/components/design/VmSelect'
import { GenHero, Spinner } from '@/components/design/animations'
import { useVmLang, trVm } from '@/i18n/redesign'

const QUALITIES = [
  { value: 'fast', zh: '快速', en: 'Fast' },
  { value: 'medium', zh: '标准', en: 'Standard' },
  { value: 'slow', zh: '高质量', en: 'Best' },
]

const FORMAT_ICONS: Record<string, JSX.Element> = {
  toc: <ListTree size={15} />,
  link: <LinkIcon size={15} />,
  screenshot: <ImageIcon size={15} />,
  summary: <Sparkles size={15} />,
}

const STEP_DEFS = [
  { key: 'PARSING', zhKey: 'step_parse', icon: <LinkIcon size={18} /> },
  { key: 'DOWNLOADING', zhKey: 'step_download', icon: <Download size={18} /> },
  { key: 'TRANSCRIBING', zhKey: 'step_transcribe', icon: <AudioWaveform size={18} /> },
  { key: 'SUMMARIZING', zhKey: 'step_summarize', icon: <Sparkles size={18} /> },
  { key: 'SUCCESS', zhKey: 'step_done', icon: <Check size={18} /> },
]

/* -------------------- 未运行草稿持久化 -------------------- */
// 新建笔记表单内容自动存 localStorage：切走页面再回来（组件重挂载）恢复上次还没提交运行的内容；
// 提交成功后清除。
const DRAFT_KEY = 'vm-note-draft'
interface NoteDraft {
  platform?: string
  url?: string
  modelName?: string
  style?: string
  quality?: string
  formats?: string[]
  vision?: boolean
  intervalSec?: number | ''
  cols?: number
  rows?: number
  extras?: string
}
function loadDraft(): NoteDraft {
  try {
    const s = localStorage.getItem(DRAFT_KEY)
    return s ? (JSON.parse(s) as NoteDraft) : {}
  } catch {
    return {}
  }
}
function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    /* ignore */
  }
}

const NewNoteRedesigned: FC = () => {
  const lang = useVmLang()
  const navigate = useNavigate()
  const addPendingTask = useTaskStore(s => s.addPendingTask)
  const tasks = useTaskStore(s => s.tasks)
  const { modelList, loadEnabledModels } = useModelStore()

  // 上次未运行的草稿（组件重挂载时读取一次，用于初始化各表单字段）
  const draft = useMemo(() => loadDraft(), [])

  const [customPlatformList, setCustomPlatformList] = useState(() => getCustomPlatforms())
  const [view, setView] = useState<'form' | 'flow'>('form')

  const [platform, setPlatform] = useState(draft.platform ?? 'bilibili')
  const [touchedPf, setTouchedPf] = useState(false)
  const [url, setUrl] = useState(draft.url ?? '')
  const [modelName, setModelName] = useState(draft.modelName ?? '')
  const [style, setStyle] = useState(draft.style ?? 'minimal')
  const [quality, setQuality] = useState(draft.quality ?? 'medium')
  // 默认只勾「目录 / AI 总结」，跟原本的 NoteForm 一致。
  // 「原片跳转」（link）会让 LLM 改用线性时间组织内容，破坏概念分组的笔记结构，
  // 所以保持需要用户主动勾选。截图依赖视频理解，没开 vision 之前保持关闭。
  const [formats, setFormats] = useState<string[]>(draft.formats ?? ['toc', 'summary'])
  const [vision, setVision] = useState(draft.vision ?? false)
  // 采样间隔默认 30s，上限 300s；用 number | '' 允许删空后重新输入
  const [intervalSec, setIntervalSec] = useState<number | ''>(draft.intervalSec ?? 30)
  const [cols, setCols] = useState(draft.cols ?? 2)
  const [rows, setRows] = useState(draft.rows ?? 2)
  const [extras, setExtras] = useState(draft.extras ?? '')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadOk, setUploadOk] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showHist, setShowHist] = useState(false)

  // 上一次输入过的视频链接（只取最新一条，非本地），用于链接输入框下拉提示
  const urlHistory = useMemo(() => {
    for (const t of tasks) {
      const u = (t.formData?.video_url || '').trim()
      if (!u || t.formData?.platform === 'local') continue
      return [u]
    }
    return []
  }, [tasks])

  // 草稿自动保存：表单任何字段变化都写入 localStorage（flow 阶段不再保存）
  useEffect(() => {
    if (view !== 'form') return
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ platform, url, modelName, style, quality, formats, vision, intervalSec, cols, rows, extras }),
      )
    } catch {
      /* ignore quota / 隐私模式异常 */
    }
  }, [view, platform, url, modelName, style, quality, formats, vision, intervalSec, cols, rows, extras])

  useEffect(() => {
    loadEnabledModels()
    listCustomPlatforms()
      .then(list => {
        const arr = Array.isArray(list) ? list : []
        setCustomPlatformList(arr)
        setCustomPlatforms(arr)
      })
      .catch(() => {})
  }, [loadEnabledModels])

  useEffect(() => {
    if (!modelName && modelList[0]?.model_name) setModelName(modelList[0].model_name)
  }, [modelList, modelName])

  useEffect(() => {
    if (!url || (platform === 'local' && touchedPf)) return
    const detected = detectPlatform(url)
    if (detected && detected !== platform) setPlatform(detected)
  }, [url, platform, touchedPf])

  const platformOpts = useMemo(() => {
    const base = Object.keys(PLATFORMS).map(k => ({ value: k }))
    const customs = customPlatformList.map(cp => ({ value: cp.key }))
    return [...base, ...customs]
  }, [customPlatformList])

  const detectedShow = !!detectPlatform(url)
  const toggleFmt = (v: string) =>
    setFormats(f => (f.includes(v) ? f.filter(x => x !== v) : [...f, v]))

  const handleFileUpload = async (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    setIsUploading(true)
    setUploadOk(false)
    try {
      const data = await uploadFile(fd)
      setUrl((data as any).url)
      setUploadOk(true)
    } catch (e) {
      console.error('upload failed', e)
      toast.error(lang === 'zh' ? '上传失败' : 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  const onGenerate = async () => {
    if (submitting) return
    if (!url) {
      toast.error(lang === 'zh' ? '请填写视频链接或本地路径' : 'Please provide a URL or local path')
      return
    }
    if (!modelName) {
      toast.error(lang === 'zh' ? '请先在「设置 → AI 模型」添加模型' : 'Add a model in Settings → AI models first')
      navigate('/settings/model')
      return
    }
    const model = modelList.find(m => m.model_name === modelName)
    if (!model) return
    setSubmitting(true)
    setView('flow')
    // 注意：后端 VideoRequest 同时需要顶层布尔 (screenshot/link/video_understanding)
    // 和 format 数组——前者控制下载/采帧流程，后者控制 markdown 插入逻辑。两个都得给。
    // video_understanding 字段名不能写成 video_understand（之前漏了 "ing"，导致视频理解一直不生效）。
    const payload = {
      video_url: url,
      platform,
      quality,
      model_name: modelName,
      provider_id: (model as any).provider_id,
      format: formats,
      link: formats.includes('link'),
      screenshot: formats.includes('screenshot'),
      style,
      extras,
      video_understanding: vision,
      // 采样间隔留空时兜底为默认 30 秒
      video_interval: intervalSec === '' ? 30 : intervalSec,
      grid_size: [cols, rows] as [number, number],
    }
    try {
      const data: any = await generateNote(payload as any)
      addPendingTask(data.task_id, platform, payload as any)
      clearDraft() // 已提交运行，清除未运行草稿
    } catch (e: any) {
      if (e?.data?.reason === 'transcriber_model_not_ready') {
        const downloading = e?.data?.downloading
        toast.error(
          downloading
            ? lang === 'zh'
              ? '转写模型正在下载中，请稍候再提交'
              : 'Transcriber model is downloading, please wait'
            : lang === 'zh'
              ? '转写模型尚未下载，请先去「音频转写配置」页下载'
              : 'Transcriber model not downloaded — go to Transcriber settings',
        )
        if (!downloading) navigate('/settings/transcriber')
      }
      setView('form')
    } finally {
      setSubmitting(false)
    }
  }

  if (view === 'flow') {
    return (
      <GenerationFlow
        platform={platform}
        styleVal={style}
        onBack={() => setView('form')}
        onGoTasks={() => navigate('/tasks')}
      />
    )
  }

  const platformOpt = (o: { value: string }) => {
    const p = PLATFORMS[o.value]
    if (!p) {
      const cp = customPlatformList.find(c => c.key === o.value)
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ fontSize: 13 }}>{cp?.name || o.value}</span>
        </span>
      )
    }
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <Pf id={o.value} sm /> <span>{p[lang]}</span>
      </span>
    )
  }

  return (
    <div className="vm-content-inner narrow vm-fade-up">
      {/* Source */}
      <div className="vm-card vm-card-pad" style={{ marginBottom: 18 }}>
        <div className="vm-row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
          <div className="vm-row">
            <div className="vm-sec-title">{trVm('videoSource', lang)}</div>
            <div className="vm-sec-en">{lang === 'zh' ? 'Video source' : '视频来源'}</div>
          </div>
          <button className="vm-btn vm-btn-outline vm-btn-sm" onClick={() => navigate('/articles')}>
            <Newspaper size={15} />
            文章总结
          </button>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <VmSelect
            width={158}
            value={platform}
            onChange={v => {
              setPlatform(v)
              setTouchedPf(true)
            }}
            options={platformOpts}
            renderOption={platformOpt}
          />
          {platform === 'local' ? (
            <input
              className="vm-input vm-grow vm-input-mono"
              placeholder={trVm('localPath', lang)}
              value={url}
              onChange={e => setUrl(e.target.value)}
            />
          ) : (
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                className="vm-input vm-input-mono"
                style={{ paddingRight: detectedShow ? 110 : 13 }}
                placeholder={trVm('pasteLink', lang)}
                value={url}
                onChange={e => setUrl(e.target.value)}
                onFocus={() => setShowHist(true)}
                // 延迟关闭，确保点击下拉项的 onMouseDown/onClick 能先触发
                onBlur={() => window.setTimeout(() => setShowHist(false), 150)}
              />
              {/* 历史链接下拉：自定义浮层，左右对齐输入框 */}
              {showHist && urlHistory.length > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0,
                    right: 0,
                    zIndex: 30,
                    background: 'var(--vm-surface)',
                    border: '1px solid var(--vm-border)',
                    borderRadius: 'var(--vm-radius-sm)',
                    boxShadow: '0 8px 24px rgba(0,0,0,.12)',
                    overflow: 'hidden',
                  }}
                >
                  {urlHistory.map(u => (
                    <div
                      key={u}
                      // 用 onMouseDown 抢在 input onBlur 之前执行，避免点击丢失
                      onMouseDown={e => {
                        e.preventDefault()
                        setUrl(u)
                        setShowHist(false)
                      }}
                      title={u}
                      style={{
                        padding: '9px 12px',
                        fontSize: 12.5,
                        fontFamily: 'var(--vm-mono, monospace)',
                        color: 'var(--vm-text)',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      onMouseEnter={e =>
                        (e.currentTarget.style.background = 'var(--vm-surface-2)')
                      }
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {u}
                    </div>
                  ))}
                </div>
              )}
              {detectedShow && (
                <span
                  className="vm-badge vm-badge-ok"
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                  }}
                >
                  <CheckCircle2 size={13} /> {trVm('detected', lang)}
                </span>
              )}
            </div>
          )}
        </div>
        {platform === 'local' && (
          <div
            style={{
              marginTop: 12,
              height: 130,
              border: '2px dashed var(--vm-border-strong)',
              borderRadius: 'var(--vm-radius)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              color: 'var(--vm-muted)',
              cursor: 'pointer',
              background: 'var(--vm-surface-2)',
            }}
            onDragOver={e => {
              e.preventDefault()
              e.stopPropagation()
            }}
            onDrop={e => {
              e.preventDefault()
              const file = e.dataTransfer.files?.[0]
              if (file) handleFileUpload(file)
            }}
            onClick={() => {
              const input = document.createElement('input')
              input.type = 'file'
              input.accept = 'video/*'
              input.onchange = ev => {
                const f = (ev.target as HTMLInputElement).files?.[0]
                if (f) handleFileUpload(f)
              }
              input.click()
            }}
          >
            <div style={{ color: 'var(--vm-primary)' }}>
              <Upload size={26} />
            </div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              {isUploading
                ? lang === 'zh'
                  ? '上传中…'
                  : 'Uploading…'
                : uploadOk
                  ? lang === 'zh'
                    ? '上传成功'
                    : 'Upload complete'
                  : trVm('dropFile', lang)}
            </div>
          </div>
        )}
      </div>

      {/* Model + Style + Quality */}
      <div className="vm-card vm-card-pad" style={{ marginBottom: 18 }}>
        <div className="vm-grid-2">
          <Field label={trVm('model', lang)} en={lang === 'zh' ? 'Model' : '模型'}>
            {modelList.length > 0 ? (
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
              />
            ) : (
              <button
                className="vm-btn vm-btn-outline vm-btn-block"
                onClick={() => navigate('/settings/model')}
              >
                {lang === 'zh' ? '请先添加模型' : 'Add a model first'}
              </button>
            )}
          </Field>
          <Field label={trVm('noteStyle', lang)} en={lang === 'zh' ? 'Style' : '风格'}>
            <VmSelect
              value={style}
              onChange={setStyle}
              options={noteStyles.map(s => ({ value: s.value, label: s.label }))}
            />
          </Field>
        </div>
        <div className="vm-field" style={{ marginBottom: 0 }}>
          <div className="vm-field-head">
            <span className="vm-field-label">{trVm('quality', lang)}</span>
            <span className="vm-field-hint">{lang === 'zh' ? 'Audio quality' : '音频质量'}</span>
          </div>
          <Segmented
            value={quality}
            onChange={setQuality}
            options={QUALITIES.map(q => ({ value: q.value, label: q[lang] }))}
          />
        </div>
      </div>

      {/* Include / Vision */}
      <div className="vm-card vm-card-pad" style={{ marginBottom: 18 }}>
        <Field
          label={trVm('contents', lang)}
          en={lang === 'zh' ? 'Include' : '内容选项'}
          hint={trVm('contentsHint', lang)}
        >
          <div className="vm-chip-row">
            {noteFormats.map(f => {
              const disabled =
                (f.value === 'link' && platform === 'local') ||
                (f.value === 'screenshot' && !vision)
              const on = formats.includes(f.value)
              return (
                <Chip
                  key={f.value}
                  on={on}
                  disabled={disabled}
                  onClick={() => toggleFmt(f.value)}
                >
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
        </Field>

        <div className="vm-divider" />
        <div className="vm-row" style={{ justifyContent: 'space-between' }}>
          <div className="vm-row" style={{ gap: 11 }}>
            <span style={{ color: vision ? 'var(--vm-primary)' : 'var(--vm-faint)', display: 'grid' }}>
              <ImageIcon size={19} />
            </span>
            <div>
              <div className="vm-field-label">{trVm('videoUnd', lang)}</div>
              <div className="vm-field-hint">{trVm('videoUndHint', lang)}</div>
            </div>
          </div>
          <Toggle on={vision} onClick={() => setVision(v => !v)} />
        </div>
        {vision && (
          <div className="vm-fade-up" style={{ marginTop: 16 }}>
            <div className="vm-grid-2">
              <Field label={trVm('interval', lang)}>
                <input
                  className="vm-input"
                  type="number"
                  min={1}
                  max={300}
                  step={1}
                  value={intervalSec}
                  onChange={e => {
                    const raw = e.target.value
                    if (raw === '') {
                      // 允许删空后重新输入，不再立刻回弹成默认值
                      setIntervalSec('')
                      return
                    }
                    let n = Number(raw)
                    if (Number.isNaN(n)) return
                    if (n > 300) n = 300
                    if (n < 1) n = 1
                    setIntervalSec(n)
                  }}
                />
              </Field>
              <Field label={trVm('grid', lang)}>
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
              </Field>
            </div>
            <div
              className="vm-badge vm-badge-warn"
              style={{ borderRadius: 'var(--vm-radius-sm)', padding: '9px 13px' }}
            >
              <Bot size={15} /> {trVm('visionWarn', lang)}
            </div>
          </div>
        )}
      </div>

      {/* Extras */}
      <div className="vm-card vm-card-pad" style={{ marginBottom: 22 }}>
        <Field label={trVm('notes', lang)} en={lang === 'zh' ? 'Optional' : '可选'}>
          <textarea
            className="vm-textarea"
            rows={3}
            placeholder={trVm('notesPh', lang)}
            value={extras}
            onChange={e => setExtras(e.target.value)}
          />
        </Field>
      </div>

      <button
        className="vm-btn vm-btn-primary vm-btn-lg vm-btn-block"
        onClick={onGenerate}
        disabled={submitting}
      >
        {submitting ? <Spinner size={19} /> : <Sparkles size={19} />}
        {trVm('generate', lang)}
      </button>
    </div>
  )
}

/* ============ GENERATION FLOW ============ */
const GenerationFlow: FC<{
  platform: string
  styleVal: string
  onBack: () => void
  onGoTasks: () => void
}> = ({ platform, styleVal, onBack, onGoTasks }) => {
  const lang = useVmLang()
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const [sec, setSec] = useState(0)
  const timer = useRef<number | null>(null)
  const clock = useRef<number | null>(null)

  useEffect(() => {
    clock.current = window.setInterval(() => setSec(s => s + 1), 1000)
    return () => {
      if (clock.current) window.clearInterval(clock.current)
    }
  }, [])
  useEffect(() => {
    if (paused || idx >= STEP_DEFS.length - 1) return
    timer.current = window.setTimeout(
      () => setIdx(i => Math.min(i + 1, STEP_DEFS.length - 1)),
      idx === 2 ? 2600 : 1700,
    )
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [idx, paused])

  const done = idx >= STEP_DEFS.length - 1
  const canPause = idx < 3 && !done
  const styleLabel = noteStyles.find(s => s.value === styleVal)?.label || styleVal
  const fmtSec = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`

  return (
    <div className="vm-content-inner narrow vm-fade-up" style={{ paddingTop: 44 }}>
      <div className="vm-card" style={{ overflow: 'hidden' }}>
        <div
          style={{
            padding: '20px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--vm-border)',
          }}
        >
          <div className="vm-row" style={{ gap: 12 }}>
            <Pf id={platform} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>
                {done ? trVm('flowDone', lang) : trVm('flowTitle', lang)}
              </div>
              <div className="vm-field-hint">
                {done ? trVm('flowDoneSub', lang) : trVm('flowSub', lang)}
              </div>
            </div>
          </div>
          <div className="vm-row" style={{ gap: 14 }}>
            <span className="vm-badge vm-badge-neutral">{styleLabel}</span>
            <div
              className="vm-row"
              style={{ gap: 6, color: 'var(--vm-muted)', fontSize: 13, fontWeight: 600 }}
            >
              <Clock size={15} /> <span className="vm-mono">{fmtSec}</span>
            </div>
          </div>
        </div>

        <div style={{ padding: '18px 24px 8px', background: 'var(--vm-surface-2)' }}>
          <GenHero stepIndex={idx} />
        </div>

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
                  {i < idx ? <Check size={20} strokeWidth={3} /> : i === idx && !done ? <Spinner size={18} /> : s.icon}
                </div>
                <div className="vm-step-label">{trVm(s.zhKey, lang)}</div>
                <div className="vm-step-en">
                  {lang === 'zh' ? trVm(s.zhKey, 'en') : s.key.slice(0, 1) + s.key.slice(1).toLowerCase()}
                </div>
              </div>
            ))}
          </div>
        </div>

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
          {!done ? (
            <>
              <div className="vm-field-hint" style={{ maxWidth: 360 }}>
                {idx >= 3
                  ? lang === 'zh'
                    ? '即将完成 — 总结阶段无法暂停'
                    : 'Almost there — summarizing can’t be paused'
                  : lang === 'zh'
                    ? '前三步可随时暂停'
                    : 'Pausable during the first three steps'}
              </div>
              <div className="vm-row" style={{ gap: 10 }}>
                <button className="vm-btn vm-btn-ghost vm-btn-sm" onClick={onBack}>
                  <XIcon size={16} /> {trVm('cancel', lang)}
                </button>
                <button
                  className="vm-btn vm-btn-outline vm-btn-sm"
                  disabled={!canPause}
                  onClick={() => setPaused(p => !p)}
                >
                  {paused ? <Play size={16} /> : <PauseIcon size={16} />}
                  {paused ? trVm('resume', lang) : trVm('pause', lang)}
                </button>
              </div>
            </>
          ) : (
            <>
              <div
                className="vm-row"
                style={{ gap: 9, color: 'var(--vm-ok)', fontWeight: 700, fontSize: 14 }}
              >
                <CheckCircle2 size={18} /> {trVm('flowDone', lang)}
              </div>
              <div className="vm-row" style={{ gap: 10 }}>
                <button className="vm-btn vm-btn-outline vm-btn-sm" onClick={onBack}>
                  <Plus size={16} /> {trVm('again', lang)}
                </button>
                <button className="vm-btn vm-btn-primary vm-btn-sm" onClick={onGoTasks}>
                  <ArrowRight size={16} /> {trVm('openNote', lang)}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default NewNoteRedesigned
