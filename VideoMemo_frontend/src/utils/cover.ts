/**
 * 封面 URL 解析：把 audio_meta.cover_url 变成「按顺序尝试」的候选列表。
 *
 * 背景：
 * - 新笔记的封面在后端生成时已本地化为 `/static/covers/...`，拼上后端地址即可；
 * - 旧笔记存的是远程 CDN URL：
 *   - B 站封面常是 `http://` 直链，桌面端（Tauri WebView 安全上下文）会按
 *     mixed content 拦截且不一定触发 onError，所以 http 直链一律改走后端 image_proxy；
 *   - https 直链（YouTube / XHS 等）优先直连（配合 referrerPolicy="no-referrer"），
 *     失败再退到 image_proxy（抖音/快手签名 URL 过期则两条路都救不了，最终回退渐变底）。
 */

const API_BASE = (String(import.meta.env.VITE_API_BASE_URL || '/api')).replace(/\/$/, '')
/** 后端源（去掉 /api 后缀）；dev 下为空串 → 相对路径走 vite/nginx 代理 */
const BACKEND_ORIGIN = API_BASE.replace(/\/api$/, '')

/** 走后端 image_proxy 的 URL（后端会按图片 host 选择正确的 Referer） */
export function proxiedCoverUrl(remoteUrl: string): string {
  return `${API_BASE}/image_proxy?url=${encodeURIComponent(remoteUrl)}`
}

/** 返回按顺序尝试的封面候选 URL 列表；空数组表示没有封面，直接用渐变兜底。 */
export function coverCandidates(coverUrl?: string): string[] {
  if (!coverUrl) return []
  // 后端本地化后的相对路径（/static/covers/...）→ 拼后端源
  if (coverUrl.startsWith('/')) return [BACKEND_ORIGIN + coverUrl]
  // http 直链：桌面端必被 mixed content 拦截，直接走代理
  if (coverUrl.startsWith('http://')) return [proxiedCoverUrl(coverUrl)]
  // https 直链：直连优先，失败退代理
  if (coverUrl.startsWith('https://')) return [coverUrl, proxiedCoverUrl(coverUrl)]
  return [coverUrl]
}
