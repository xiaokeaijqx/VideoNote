import { FC, JSX } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  AudioWaveform,
  BotMessageSquare,
  CheckCircle2,
  Download,
  Library,
  ListTodo,
  Plus,
} from 'lucide-react'
import { useVmLang, trVm } from '@/i18n/redesign'

interface StepDef {
  icon: JSX.Element
  to: string
  zh: { t: string; d: string; tip: string; cta: string }
  en: { t: string; d: string; tip: string; cta: string }
}

const STEPS: StepDef[] = [
  {
    icon: <BotMessageSquare />,
    to: '/settings/model',
    zh: {
      t: '配置 AI 模型',
      d: '生成笔记需要先连一个大模型供应商（DeepSeek、OpenAI 兼容、本地都支持）。',
      tip: '在「设置 → AI 模型设置」新建供应商，填好 API Key，启用要用的模型。',
      cta: '去配置',
    },
    en: {
      t: 'Connect an AI model',
      d: 'You need an LLM provider first — DeepSeek, OpenAI-compatible, or local all work.',
      tip: 'Settings → AI models → add a provider, paste your API key, enable a model.',
      cta: 'Configure',
    },
  },
  {
    icon: <AudioWaveform />,
    to: '/settings/transcriber',
    zh: {
      t: '准备音频转写器',
      d: '没有字幕的视频要把音频转成文字。Apple Silicon 推荐 mlx-whisper，通用环境用 fast-whisper。',
      tip: '在「音频转写配置」选引擎并下载模型（tiny / base 几十 MB，large-v3-turbo 质量最高）。',
      cta: '去配置',
    },
    en: {
      t: 'Set up transcription',
      d: 'Videos without captions need audio→text. mlx-whisper for Apple Silicon, fast-whisper elsewhere.',
      tip: 'Pick an engine and download a model (tiny/base are tiny; large-v3-turbo is best).',
      cta: 'Configure',
    },
  },
  {
    icon: <Download />,
    to: '/settings/download',
    zh: {
      t: '配置平台 Cookie（按需）',
      d: '部分视频需要登录态。YouTube 推荐从浏览器实时读取 Cookie，避免风控轮换作废。',
      tip: '在「下载配置 → 对应平台」粘贴 Cookie 或选择浏览器。',
      cta: '去配置',
    },
    en: {
      t: 'Platform cookies (optional)',
      d: 'Some videos need a logged-in session. For YouTube, read cookies live from your browser.',
      tip: 'Downloader → pick a platform → paste a cookie or choose a browser.',
      cta: 'Configure',
    },
  },
  {
    icon: <Plus />,
    to: '/',
    zh: {
      t: '新建一篇笔记',
      d: '回工作区点「+ 新建笔记」，粘贴视频链接，平台自动识别，选好模型与风格即可。',
      tip: '勾选要包含的内容（目录 / 原片跳转 / 截图），点「生成笔记」。',
      cta: '去工作区',
    },
    en: {
      t: 'Create your first note',
      d: 'Hit "+ New note", paste a link (platform auto-detected), pick a model and style.',
      tip: 'Choose what to include (outline / timestamps / screenshots), then Generate.',
      cta: 'Open workspace',
    },
  },
  {
    icon: <ListTodo />,
    to: '/tasks',
    zh: {
      t: '看进度 / 暂停继续',
      d: '进度条显示「解析 → 下载 → 转写 → 总结 → 完成」五步，前三步可暂停。',
      tip: '想看所有任务的状态与 Token 消耗，去「任务列表」。',
      cta: '查看任务',
    },
    en: {
      t: 'Track & pause',
      d: 'The bar shows Parse → Download → Transcribe → Summarize → Done; pause in the first three.',
      tip: "See every job's status and token usage in Tasks.",
      cta: 'View tasks',
    },
  },
  {
    icon: <Library />,
    to: '/collections',
    zh: {
      t: '整理与导出',
      d: '把相关笔记建成「分类合集」，可生成闪卡复习、下载 ZIP、推送 Drive。',
      tip: '批量导入页支持多链接同时生成，适合批量积累。',
      cta: '打开合集',
    },
    en: {
      t: 'Organize & export',
      d: 'Group notes into collections — make flashcards, download ZIP, push to Drive.',
      tip: 'Batch import generates many links at once.',
      cta: 'Open collections',
    },
  },
]

const Guide: FC = () => {
  const lang = useVmLang()
  const navigate = useNavigate()
  return (
    <div className="vm-content-inner narrow vm-fade-up">
      <ol
        style={{
          listStyle: 'none',
          margin: 0,
          padding: '0 0 0 36px',
          position: 'relative',
          borderLeft: '2px solid var(--vm-border)',
        }}
      >
        {STEPS.map((s, i) => {
          const c = s[lang]
          return (
            <li key={i} style={{ marginBottom: 18, position: 'relative' }}>
              <span
                style={{
                  position: 'absolute',
                  left: -53,
                  top: 0,
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  background: 'var(--vm-primary)',
                  color: 'var(--vm-primary-fg)',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 800,
                  fontSize: 14,
                  boxShadow: 'var(--vm-shadow-sm)',
                }}
              >
                {i + 1}
              </span>
              <div className="vm-card vm-card-pad">
                <div className="vm-row" style={{ gap: 11, marginBottom: 8 }}>
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      background: 'var(--vm-primary-soft)',
                      color: 'var(--vm-primary)',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    {s.icon}
                  </span>
                  <span style={{ fontSize: 16.5, fontWeight: 800 }}>{c.t}</span>
                </div>
                <p className="vm-muted" style={{ margin: '0 0 8px', fontSize: 14, lineHeight: 1.6 }}>
                  {c.d}
                </p>
                <p className="vm-faint" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55 }}>
                  <b style={{ color: 'var(--vm-muted)' }}>{lang === 'zh' ? '提示：' : 'Tip: '}</b>
                  {c.tip}
                </p>
                <button
                  className="vm-link"
                  style={{
                    marginTop: 12,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    font: 'inherit',
                    fontWeight: 700,
                  }}
                  onClick={() => navigate(s.to)}
                >
                  {c.cta} <ArrowRight size={15} />
                </button>
              </div>
            </li>
          )
        })}
      </ol>
      <div
        className="vm-card vm-card-pad"
        style={{
          marginTop: 8,
          textAlign: 'center',
          background: 'var(--vm-primary-soft)',
          borderColor: 'color-mix(in srgb, var(--vm-primary) 25%, transparent)',
        }}
      >
        <div
          style={{
            color: 'var(--vm-primary)',
            display: 'grid',
            placeItems: 'center',
            marginBottom: 8,
          }}
        >
          <CheckCircle2 size={30} />
        </div>
        <div style={{ fontWeight: 800, fontSize: 17 }}>{trVm('guideStart', lang)}</div>
        <button
          className="vm-btn vm-btn-primary"
          style={{ margin: '16px auto 0' }}
          onClick={() => navigate('/')}
        >
          <Plus size={17} />
          {trVm('newNote', lang)}
        </button>
      </div>
    </div>
  )
}

export default Guide
