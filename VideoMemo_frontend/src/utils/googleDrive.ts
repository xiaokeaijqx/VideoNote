// 纯前端 Google Drive 上传：通过 Google Identity Services 获取 access token，
// 再用 Drive REST multipart 接口上传文件。需要用户提供 OAuth Client ID。

declare global {
  interface Window {
    google?: any
  }
}

const GIS_SRC = 'https://accounts.google.com/gsi/client'
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const CLIENT_ID_KEY = 'gdrive_client_id'

export function getDriveClientId(): string {
  return localStorage.getItem(CLIENT_ID_KEY) || ''
}

export function setDriveClientId(id: string) {
  localStorage.setItem(CLIENT_ID_KEY, id.trim())
}

function loadGis(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve()
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('加载 Google 登录脚本失败')))
      return
    }
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('加载 Google 登录脚本失败'))
    document.head.appendChild(script)
  })
}

function requestAccessToken(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (resp: any) => {
        if (resp.error) {
          reject(new Error(resp.error_description || resp.error))
        } else {
          resolve(resp.access_token)
        }
      },
    })
    tokenClient.requestAccessToken({ prompt: '' })
  })
}

async function uploadFile(
  blob: Blob,
  filename: string,
  accessToken: string,
): Promise<{ id: string; webViewLink?: string }> {
  const metadata = { name: filename, mimeType: blob.type || 'application/zip' }
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
  form.append('file', blob)

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    },
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Drive 上传失败 (${res.status}): ${text}`)
  }
  return res.json()
}

/** 上传一个 Blob 到用户的 Google Drive，返回文件查看链接。 */
export async function uploadBlobToDrive(
  blob: Blob,
  filename: string,
  clientId: string,
): Promise<{ id: string; webViewLink?: string }> {
  if (!clientId) throw new Error('缺少 Google OAuth Client ID')
  await loadGis()
  const token = await requestAccessToken(clientId)
  return uploadFile(blob, filename, token)
}
