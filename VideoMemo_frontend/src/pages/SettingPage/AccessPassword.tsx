import { useMemo, useState } from 'react'
import { Eye, EyeOff, KeyRound, Save, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

const STORAGE_KEY = 'webAccessPassword'

function readPassword() {
  try {
    return localStorage.getItem(STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

const AccessPassword = () => {
  const initialPassword = useMemo(() => readPassword(), [])
  const [password, setPassword] = useState(initialPassword)
  const [visible, setVisible] = useState(false)

  const savePassword = () => {
    try {
      const value = password.trim()
      if (value) localStorage.setItem(STORAGE_KEY, value)
      else localStorage.removeItem(STORAGE_KEY)
      toast.success(value ? '访问密码已保存' : '访问密码已清除')
    } catch {
      toast.error('保存访问密码失败')
    }
  }

  const clearPassword = () => {
    setPassword('')
    try {
      localStorage.removeItem(STORAGE_KEY)
      toast.success('访问密码已清除')
    } catch {
      toast.error('清除访问密码失败')
    }
  }

  return (
    <div className="vm-content-inner narrow vm-fade-up">
      <div className="vm-card vm-card-pad">
        <div className="vm-row" style={{ gap: 12, marginBottom: 14 }}>
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
            <KeyRound size={19} />
          </span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>访问密码</div>
            <div className="vm-muted" style={{ fontSize: 13 }}>
              后端设置 WEB_ACCESS_PASSWORD 后，前端请求会自动携带这里保存的密码。
            </div>
          </div>
        </div>

        <label className="vm-field-label" htmlFor="web-access-password">
          Web 访问密码
        </label>
        <div className="vm-row" style={{ gap: 8, alignItems: 'stretch', marginTop: 8 }}>
          <input
            id="web-access-password"
            className="vm-input"
            type={visible ? 'text' : 'password'}
            value={password}
            placeholder="未启用访问密码时可留空"
            onChange={event => setPassword(event.target.value)}
            style={{ flex: 1 }}
          />
          <button className="vm-tool-btn" type="button" onClick={() => setVisible(value => !value)}>
            {visible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        <div className="vm-field-hint" style={{ marginTop: 10, whiteSpace: 'normal' }}>
          这是轻量级本地访问保护，不替代公网部署时的 HTTPS、反向代理认证或更完整的账号系统。
        </div>

        <div className="vm-row" style={{ gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
          <button className="vm-btn vm-btn-primary" type="button" onClick={savePassword}>
            <Save size={16} /> 保存
          </button>
          <button className="vm-btn vm-btn-outline" type="button" onClick={clearPassword}>
            <Trash2 size={16} /> 清除
          </button>
        </div>
      </div>
    </div>
  )
}

export default AccessPassword
