import { useEffect, useRef, useState } from 'react'
import { Check, Copy, HardDriveDownload, RefreshCw, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { Switch } from '@/components/ui/switch'
import { getWorkerConfig, updateWorkerConfig } from '@/services/worker'

// 可走「外部下载」的平台（机房 IP 容易被风控的，默认只 youtube）
const PLATFORMS: { key: string; label: string }[] = [
  { key: 'youtube', label: 'YouTube' },
  { key: 'bilibili', label: 'B站' },
  { key: 'douyin', label: '抖音' },
  { key: 'kuaishou', label: '快手' },
]

const CodeBlock = ({ code }: { code: string }) => {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('复制失败，请手动选择复制')
    }
  }
  return (
    <div
      className="vm-row"
      style={{
        gap: 8,
        alignItems: 'flex-start',
        background: 'var(--vm-code-bg, #0f172a)',
        color: '#e2e8f0',
        borderRadius: 8,
        padding: '10px 12px',
        marginTop: 6,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 12.5,
        lineHeight: 1.6,
      }}
    >
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', flex: 1, overflowX: 'auto' }}>{code}</pre>
      <button className="vm-tool-btn" type="button" onClick={copy} aria-label="复制" title="复制">
        {copied ? <Check size={15} /> : <Copy size={15} />}
      </button>
    </div>
  )
}

const LocalDownloader = () => {
  const [enabled, setEnabled] = useState(false)
  const [platforms, setPlatforms] = useState<string[]>(['youtube'])
  const [online, setOnline] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const timer = useRef<number | null>(null)

  const refresh = async (silent = false) => {
    try {
      const cfg = await getWorkerConfig()
      setEnabled(!!cfg.enabled)
      setPlatforms(cfg.platforms || [])
      setOnline(!!cfg.worker_online)
    } catch {
      if (!silent) setOnline(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // 每 5s 刷新一次在线状态
    timer.current = window.setInterval(() => refresh(true), 5000)
    return () => {
      if (timer.current) window.clearInterval(timer.current)
    }
  }, [])

  const togglePlatform = (key: string) => {
    setPlatforms(prev => (prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const cfg = await updateWorkerConfig(enabled, platforms)
      setEnabled(!!cfg.enabled)
      setPlatforms(cfg.platforms || [])
      toast.success('已保存')
    } catch {
      /* 拦截器已 toast */
    } finally {
      setSaving(false)
    }
  }

  const curlCmd =
    'curl -fsSL https://raw.githubusercontent.com/xiaokeaijqx/VideoNote/main/downloader-worker/install.sh | sh'
  const installCmd = 'cd downloader-worker && sh install.sh'
  const logCmd = 'tail -f ~/Library/Logs/videonote-worker.log'
  const restartCmd = 'launchctl kickstart -k "gui/$(id -u)/com.videonote.worker"'
  const stopCmd = 'launchctl unload ~/Library/LaunchAgents/com.videonote.worker.plist'

  if (loading) {
    return (
      <div className="vm-content-inner narrow vm-fade-up">
        <div className="vm-card vm-card-pad">
          <div className="vm-muted text-sm">加载本地下载器配置…</div>
        </div>
      </div>
    )
  }

  return (
    <div className="vm-content-inner narrow vm-fade-up">
      <div className="vm-card vm-card-pad">
        {/* 标题 + 在线状态 */}
        <div className="vm-row" style={{ gap: 12, marginBottom: 16, alignItems: 'flex-start' }}>
          <span
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'var(--vm-primary-soft)',
              color: 'var(--vm-primary)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <HardDriveDownload size={19} />
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>本地下载器</div>
            <div className="vm-muted" style={{ fontSize: 13 }}>
              YouTube 等平台在服务器机房 IP 上会被风控。开启后，这些平台的下载改由你电脑上的
              worker（住宅 IP）完成，再回传服务器转写总结。
            </div>
          </div>
          <span
            className="vm-row"
            style={{
              gap: 6,
              fontSize: 12.5,
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: 999,
              whiteSpace: 'nowrap',
              background: online ? 'rgba(34,197,94,.12)' : 'rgba(148,163,184,.15)',
              color: online ? '#16a34a' : '#64748b',
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: online ? '#22c55e' : '#94a3b8',
              }}
            />
            {online ? '在线' : '离线'}
            <RefreshCw
              size={13}
              style={{ cursor: 'pointer', opacity: 0.7 }}
              onClick={() => refresh()}
            />
          </span>
        </div>

        {!online && (
          <div
            className="vm-field-hint"
            style={{
              whiteSpace: 'normal',
              background: 'rgba(245,158,11,.1)',
              color: '#b45309',
              borderRadius: 8,
              padding: '8px 12px',
              marginBottom: 14,
            }}
          >
            worker 当前离线：按下方「安装」装好并启动后，这里会变「在线」。离线时对配置的平台发起
            生成会提示先启动 worker。
          </div>
        )}

        {/* 开关 */}
        <div className="vm-row" style={{ justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>启用外部下载</div>
            <div className="vm-muted" style={{ fontSize: 12 }}>
              关闭后所有平台都在服务器下载（YouTube 会失败）。
            </div>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        {/* 平台 */}
        <label className="vm-field-label" style={{ marginTop: 16 }}>
          走本地下载器的平台
        </label>
        <div className="vm-row" style={{ gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
          {PLATFORMS.map(p => {
            const active = platforms.includes(p.key)
            return (
              <button
                key={p.key}
                type="button"
                disabled={!enabled}
                onClick={() => togglePlatform(p.key)}
                className={'vm-btn vm-btn-sm ' + (active ? 'vm-btn-primary' : 'vm-btn-outline')}
                style={{ opacity: enabled ? 1 : 0.5 }}
              >
                {p.label}
              </button>
            )
          })}
        </div>
        <div className="vm-field-hint" style={{ marginTop: 8, whiteSpace: 'normal' }}>
          只建议把会被风控的平台（如 YouTube）放进来；B站/抖音等服务器一般能直接下。
        </div>

        <div className="vm-row" style={{ marginTop: 18 }}>
          <button className="vm-btn vm-btn-primary" type="button" onClick={handleSave} disabled={saving}>
            <Save size={16} /> {saving ? '保存中…' : '保存配置'}
          </button>
        </div>

        {/* 安装指引 */}
        <div style={{ marginTop: 24, borderTop: '1px solid var(--vm-border, #e5e7eb)', paddingTop: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>在本地安装 worker</div>
          <div className="vm-muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
            只需电脑装了 <b>Python 3.10+</b>。运行后会<b>自动检测环境（缺 ffmpeg 用 brew 自动装）、
            提示你输入访问密码、装好并启动、还会验证是否上线</b>。无需手动配置。
          </div>

          <div style={{ fontSize: 13, fontWeight: 600 }}>① 安装并启动</div>
          <div className="vm-field-hint" style={{ margin: '4px 0', whiteSpace: 'normal' }}>
            <b>无需 clone 仓库</b>，终端跑这一条即可（自动下载脚本、检测环境、问你密码、装好并启动）：
          </div>
          <CodeBlock code={curlCmd} />
          <div className="vm-field-hint" style={{ margin: '6px 0', whiteSpace: 'normal' }}>
            已有本仓库的话，也可在 Finder 双击 <code>downloader-worker/install.command</code>，
            或终端 <code>{installCmd}</code>。
          </div>

          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 12 }}>② 看运行日志（确认在线）</div>
          <CodeBlock code={logCmd} />

          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 12 }}>常用：改完密码/配置后重启</div>
          <CodeBlock code={restartCmd} />

          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 12 }}>停止</div>
          <CodeBlock code={stopCmd} />

          <div className="vm-field-hint" style={{ marginTop: 12, whiteSpace: 'normal', lineHeight: 1.7 }}>
            装好且显示「在线」后，<b>网页端照常贴 YouTube 链接生成</b>即可，下载会自动走你电脑、绕开封控。
            worker 必须保持开机运行（已设为开机自启，平时无需管）。
          </div>
        </div>
      </div>
    </div>
  )
}

export default LocalDownloader
