import { FC } from 'react'
import {
  AudioWaveform,
  Cloud,
  Download,
  Github,
  Layers,
  Library,
  ListTodo,
  Search,
  Sparkles,
  Star,
} from 'lucide-react'
import { BrandMark } from '@/components/design/BrandMark'
import { useVmLang } from '@/i18n/redesign'

const REPO_URL = 'https://github.com/xiaokeaijqx/VideoNote'
const RELEASES_URL = `${REPO_URL}/releases`

interface Feat {
  icon: JSX.Element
  zh: [string, string]
  en: [string, string]
}

const FEATURES: Feat[] = [
  {
    icon: <Layers size={19} />,
    zh: ['多平台 + 自定义', '内建 6 大平台，可登记任意 yt-dlp 平台并存 Cookie。'],
    en: ['Multi-platform', '6 built-in platforms; register any yt-dlp site with cookies.'],
  },
  {
    icon: <Sparkles size={19} />,
    zh: ['AI 笔记生成', '9 种风格，可选目录、原片跳转、关键画面截图。'],
    en: ['AI notes', '9 styles, optional outline, timestamps and key-frame shots.'],
  },
  {
    icon: <AudioWaveform size={19} />,
    zh: ['音频转写', '优先用平台字幕，无字幕时本地 Whisper 转写。'],
    en: ['Transcription', 'Use platform captions first, local Whisper otherwise.'],
  },
  {
    icon: <ListTodo size={19} />,
    zh: ['任务 + Token 统计', '记录每个任务的平台、模型、状态与 Token 消耗。'],
    en: ['Tasks + tokens', 'Track platform, model, status and token cost per job.'],
  },
  {
    icon: <Library size={19} />,
    zh: ['合集 + 闪卡', '归类笔记，一键生成问答闪卡，导出 ZIP / Drive。'],
    en: ['Collections + cards', 'Group notes, auto flashcards, export ZIP / Drive.'],
  },
  {
    icon: <Search size={19} />,
    zh: ['跨笔记知识库', '对全库做 RAG 对话，答案带可点击引用来源。'],
    en: ['Knowledge base', 'RAG across all notes with clickable source citations.'],
  },
]

const AboutPage: FC = () => {
  const lang = useVmLang()
  // __APP_VERSION__ is injected by vite.config; fallback if undefined
  const appVersion =
    typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__ ? __APP_VERSION__ : '2.3.4'

  return (
    <div className="vm-content-inner wide vm-fade-up">
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div
          style={{ display: 'inline-flex', alignItems: 'center', gap: 14, marginBottom: 14 }}
        >
          <BrandMark size={52} />
          <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-.02em' }}>VideoMemo</span>
          <span className="vm-badge vm-badge-neutral" style={{ fontSize: 13 }}>
            v{appVersion}
          </span>
        </div>
        <p
          className="vm-muted"
          style={{ fontSize: 16, maxWidth: 540, margin: '0 auto 20px', lineHeight: 1.6 }}
        >
          {lang === 'zh'
            ? '把视频变成结构化的 AI 笔记 —— 开源、可扩展、可桌面化的视频备忘工具。'
            : 'Turn videos into structured AI notes — an open-source, extensible, desktop-ready memo tool.'}
        </p>
        <div
          className="vm-row"
          style={{ gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 18 }}
        >
          {['Apache 2.0', 'React 19', 'FastAPI', 'yt-dlp', 'Whisper', 'Tauri'].map(b => (
            <span key={b} className="vm-badge vm-badge-neutral">
              {b}
            </span>
          ))}
        </div>
        <div className="vm-row" style={{ gap: 10, justifyContent: 'center' }}>
          <a className="vm-btn vm-btn-primary" href={REPO_URL} target="_blank" rel="noreferrer">
            <Github size={17} /> GitHub
          </a>
          <a
            className="vm-btn vm-btn-outline"
            href={RELEASES_URL}
            target="_blank"
            rel="noreferrer"
          >
            <Download size={16} /> {lang === 'zh' ? '下载桌面版' : 'Desktop app'}
          </a>
          <a className="vm-btn vm-btn-outline" href={REPO_URL} target="_blank" rel="noreferrer">
            <Star size={16} /> Star
          </a>
        </div>
      </div>

      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 14 }}>
        {lang === 'zh' ? '功能特性' : 'Features'}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))',
          gap: 14,
          marginBottom: 36,
        }}
      >
        {FEATURES.map((f, i) => {
          const c = f[lang]
          return (
            <div key={i} className="vm-card vm-card-pad">
              <span
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: 'var(--vm-primary-soft)',
                  color: 'var(--vm-primary)',
                  display: 'grid',
                  placeItems: 'center',
                  marginBottom: 11,
                }}
              >
                {f.icon}
              </span>
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 5 }}>{c[0]}</div>
              <div className="vm-muted" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
                {c[1]}
              </div>
            </div>
          )
        })}
      </div>

      <div
        className="vm-card vm-card-pad"
        style={{
          textAlign: 'center',
          background: 'var(--vm-primary-soft)',
          borderColor: 'color-mix(in srgb, var(--vm-primary) 22%, transparent)',
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
          <Cloud size={26} />
        </div>
        <div className="vm-muted" style={{ fontSize: 14 }}>
          {lang === 'zh'
            ? '欢迎 PR / Issue / Star，任何建议都可以在仓库交流。'
            : "PRs, issues and stars welcome — let's talk in the repo."}
        </div>
        <div className="vm-faint" style={{ fontSize: 12, marginTop: 8 }}>
          VideoMemo · Apache 2.0 · 2026
        </div>
      </div>
    </div>
  )
}

export default AboutPage
