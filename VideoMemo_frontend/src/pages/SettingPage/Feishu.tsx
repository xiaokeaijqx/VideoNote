import { useEffect, useState } from 'react'
import { Eye, EyeOff, Plug, Save, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import { Switch } from '@/components/ui/switch'
import {
  getFeishuConfig,
  updateFeishuConfig,
  testFeishuConnection,
  type FeishuConfigUpdate,
  type FeishuPushBackend,
} from '@/services/feishu'

const PUSH_BACKENDS: { value: FeishuPushBackend; label: string; hint: string }[] = [
  { value: 'rest', label: 'REST 直连', hint: '直接调飞书开放平台导入接口，无需 lark-cli（推荐，最稳）' },
  { value: 'cli', label: 'lark CLI', hint: '后端 subprocess 调 lark-cli（需镜像内已安装；部分版本 docs 创建有截断问题）' },
  { value: 'auto', label: '自动', hint: '后端装了 lark-cli 就用它，否则回退 REST 直连' },
]

const Feishu = () => {
  const [appId, setAppId] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [secretSet, setSecretSet] = useState(false)
  const [folderToken, setFolderToken] = useState('')
  const [wikiToken, setWikiToken] = useState('')
  const [baseUrl, setBaseUrl] = useState('https://open.feishu.cn')
  const [enabled, setEnabled] = useState(false)
  const [autoPush, setAutoPush] = useState(false)
  const [pushBackend, setPushBackend] = useState<FeishuPushBackend>('rest')
  const [showSecret, setShowSecret] = useState(false)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const cfg = await getFeishuConfig()
        setAppId(cfg.app_id || '')
        setSecretSet(!!cfg.app_secret_set)
        setFolderToken(cfg.folder_token || '')
        setWikiToken(cfg.wiki_token || '')
        setBaseUrl(cfg.base_url || 'https://open.feishu.cn')
        setEnabled(!!cfg.enabled)
        setAutoPush(!!cfg.auto_push)
        setPushBackend(cfg.push_backend || 'auto')
      } catch {
        /* 拦截器已 toast */
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const buildPayload = (): FeishuConfigUpdate => {
    const payload: FeishuConfigUpdate = {
      app_id: appId.trim(),
      folder_token: folderToken.trim(),
      wiki_token: wikiToken.trim(),
      base_url: baseUrl.trim() || 'https://open.feishu.cn',
      enabled,
      auto_push: autoPush,
      push_backend: pushBackend,
    }
    // 留空表示不修改已存的密钥；只有填了新值才覆盖
    if (appSecret.trim()) payload.app_secret = appSecret.trim()
    return payload
  }

  const persist = async (): Promise<boolean> => {
    if (enabled && (!appId.trim() || (!secretSet && !appSecret.trim()))) {
      toast.error('启用前请填写 App ID 与 App Secret')
      return false
    }
    const cfg = await updateFeishuConfig(buildPayload())
    setSecretSet(!!cfg.app_secret_set)
    setAppSecret('') // 不在前端保留明文
    return true
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (await persist()) toast.success('飞书配置已保存')
    } catch {
      /* 拦截器已 toast */
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!appId.trim() || (!secretSet && !appSecret.trim())) {
      toast.error('请先填写 App ID 与 App Secret')
      return
    }
    setTesting(true)
    const toastId = toast.loading('正在连接飞书…')
    try {
      // 先持久化当前表单，再用最新凭证测试，避免「改了没保存」测的是旧值
      await updateFeishuConfig(buildPayload())
      setAppSecret('')
      setSecretSet(true)
      const res = await testFeishuConnection()
      toast.success(res?.message || '飞书连接成功', { id: toastId })
    } catch (e: any) {
      toast.error(e?.msg || e?.message || '连接失败，请检查凭证', { id: toastId })
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <div className="vm-content-inner narrow vm-fade-up">
        <div className="vm-card vm-card-pad">
          <div className="vm-muted text-sm">加载飞书配置…</div>
        </div>
      </div>
    )
  }

  return (
    <div className="vm-content-inner narrow vm-fade-up">
      <div className="vm-card vm-card-pad">
        {/* 标题区 */}
        <div className="vm-row" style={{ gap: 12, marginBottom: 16 }}>
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
            <Send size={19} />
          </span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>飞书推送</div>
            <div className="vm-muted" style={{ fontSize: 13 }}>
              把生成的笔记一键写入飞书云文档（docx），支持手动推送与生成后自动推送。
            </div>
          </div>
        </div>

        {/* App ID */}
        <label className="vm-field-label" htmlFor="feishu-app-id">
          App ID
        </label>
        <input
          id="feishu-app-id"
          className="vm-input"
          value={appId}
          placeholder="cli_xxxxxxxxxxxxxxxx"
          onChange={e => setAppId(e.target.value)}
          style={{ marginTop: 6 }}
        />

        {/* App Secret */}
        <label className="vm-field-label" htmlFor="feishu-app-secret" style={{ marginTop: 14 }}>
          App Secret
        </label>
        <div className="vm-row" style={{ gap: 8, alignItems: 'stretch', marginTop: 6 }}>
          <input
            id="feishu-app-secret"
            className="vm-input"
            type={showSecret ? 'text' : 'password'}
            value={appSecret}
            placeholder={secretSet ? '已配置，留空表示不修改' : '应用凭证 App Secret'}
            onChange={e => setAppSecret(e.target.value)}
            style={{ flex: 1 }}
          />
          <button
            className="vm-tool-btn"
            type="button"
            onClick={() => setShowSecret(v => !v)}
            aria-label={showSecret ? '隐藏' : '显示'}
          >
            {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        {/* 目标文件夹 token */}
        <label className="vm-field-label" htmlFor="feishu-folder" style={{ marginTop: 14 }}>
          目标文件夹 Token（可选）
        </label>
        <input
          id="feishu-folder"
          className="vm-input"
          value={folderToken}
          placeholder="留空则推送到应用云空间根目录"
          onChange={e => setFolderToken(e.target.value)}
          style={{ marginTop: 6 }}
        />
        <div className="vm-field-hint" style={{ marginTop: 8, whiteSpace: 'normal' }}>
          打开飞书目标文件夹，地址 <code>/drive/folder/<b>xxxx</b></code> 末尾即文件夹 token。
          请把你的自建应用添加为该文件夹协作者，否则应用没有写入权限。
        </div>

        {/* 知识库节点 token（可选）*/}
        <label className="vm-field-label" htmlFor="feishu-wiki" style={{ marginTop: 14 }}>
          知识库节点链接 / Token（可选）
        </label>
        <input
          id="feishu-wiki"
          className="vm-input"
          value={wikiToken}
          placeholder="填了就导入到知识库，如 https://xxx.feishu.cn/wiki/XmOJ..."
          onChange={e => setWikiToken(e.target.value)}
          style={{ marginTop: 6 }}
        />
        <div className="vm-field-hint" style={{ marginTop: 8, whiteSpace: 'normal' }}>
          想把笔记放进<b>知识库(Wiki)</b>就填这里：直接粘贴知识库页面链接（<code>/wiki/xxxx</code>）即可，
          笔记会作为该节点下的子文档。需把应用<b>加入该知识库并给编辑权限</b>、并开通 <code>wiki</code> 权限。
          填了知识库就优先走知识库（上面的云空间文件夹仅作中转）。
        </div>

        {/* Base URL */}
        <label className="vm-field-label" htmlFor="feishu-base" style={{ marginTop: 14 }}>
          开放平台域名
        </label>
        <input
          id="feishu-base"
          className="vm-input"
          value={baseUrl}
          placeholder="https://open.feishu.cn"
          onChange={e => setBaseUrl(e.target.value)}
          style={{ marginTop: 6 }}
        />
        <div className="vm-field-hint" style={{ marginTop: 8, whiteSpace: 'normal' }}>
          国内租户用 <code>https://open.feishu.cn</code>；海外 Lark 用{' '}
          <code>https://open.larksuite.com</code>。
        </div>

        {/* 推送方式 */}
        <label className="vm-field-label" style={{ marginTop: 14 }}>
          推送方式
        </label>
        <div className="vm-row" style={{ gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
          {PUSH_BACKENDS.map(b => {
            const active = pushBackend === b.value
            return (
              <button
                key={b.value}
                type="button"
                onClick={() => setPushBackend(b.value)}
                className={'vm-btn vm-btn-sm ' + (active ? 'vm-btn-primary' : 'vm-btn-outline')}
              >
                {b.label}
              </button>
            )
          })}
        </div>
        <div className="vm-field-hint" style={{ marginTop: 8, whiteSpace: 'normal' }}>
          {PUSH_BACKENDS.find(b => b.value === pushBackend)?.hint}
          {pushBackend !== 'rest' && (
            <>
              {' '}
              lark CLI 需在后端镜像内 <code>npm i -g @larksuite/cli</code>；桌面端/未装 CLI
              时请用 REST 直连。
            </>
          )}
        </div>

        {/* 开关 */}
        <div
          className="vm-row"
          style={{ justifyContent: 'space-between', marginTop: 18, gap: 12 }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>启用飞书推送</div>
            <div className="vm-muted" style={{ fontSize: 12 }}>
              关闭后，笔记页的「推送飞书」按钮仍可手动推送，但不会自动推送。
            </div>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <div
          className="vm-row"
          style={{ justifyContent: 'space-between', marginTop: 14, gap: 12 }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>生成后自动推送</div>
            <div className="vm-muted" style={{ fontSize: 12 }}>
              每次笔记生成成功后自动写入飞书文档（需先启用飞书推送）。
            </div>
          </div>
          <Switch checked={autoPush} disabled={!enabled} onCheckedChange={setAutoPush} />
        </div>

        {/* 操作按钮 */}
        <div className="vm-row" style={{ gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
          <button
            className="vm-btn vm-btn-primary"
            type="button"
            onClick={handleSave}
            disabled={saving}
          >
            <Save size={16} /> {saving ? '保存中…' : '保存'}
          </button>
          <button
            className="vm-btn vm-btn-outline"
            type="button"
            onClick={handleTest}
            disabled={testing}
          >
            <Plug size={16} /> {testing ? '连接中…' : '测试连接'}
          </button>
        </div>

        {/* 使用说明 */}
        <div
          className="vm-field-hint"
          style={{ marginTop: 18, whiteSpace: 'normal', lineHeight: 1.7 }}
        >
          <b>配置步骤：</b>
          ① 到飞书开放平台创建「企业自建应用」，拿到 App ID / App Secret；
          ② 给应用开通权限：<code>docx:document</code>（创建/编辑文档）与{' '}
          <code>drive:drive</code>（云空间），发布版本；
          ③ 在飞书新建一个文件夹，把应用加为协作者，复制其 folder token 填到上方；
          ④ 测试连接通过后即可在笔记页推送。
          <br />
          注：以应用身份创建的文档归应用所有，需通过上面的协作者文件夹，你和同事才能看到。
          笔记内的本地截图（仅本机可访问）飞书抓取不到会自动跳过，不影响正文。
        </div>
      </div>
    </div>
  )
}

export default Feishu
