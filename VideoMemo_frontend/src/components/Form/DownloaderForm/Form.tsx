// 下载器 Cookie 设置表单（最简化版）
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import {
  getDownloaderCookie,
  syncDownloaderCookieFromBrowser,
  updateDownloaderCookie,
} from '@/services/downloader'
import { useParams } from 'react-router-dom'
import { COOKIE_OPTIONAL_PLATFORMS, videoPlatforms } from '@/constant/note.ts'

// yt-dlp 支持的浏览器列表（cookiesfrombrowser）
const BROWSER_OPTIONS = [
  { value: 'none', label: '不使用（用上方 Cookie 字符串）' },
  { value: 'chrome', label: 'Chrome' },
  { value: 'edge', label: 'Edge' },
  { value: 'firefox', label: 'Firefox' },
  { value: 'safari', label: 'Safari' },
  { value: 'brave', label: 'Brave' },
  { value: 'chromium', label: 'Chromium' },
  { value: 'opera', label: 'Opera' },
  { value: 'vivaldi', label: 'Vivaldi' },
  { value: 'whale', label: 'Whale' },
]

const CookieSchema = z.object({
  // 允许为空：留空保存即清除该平台的 Cookie / Token
  cookie: z.string(),
  browser: z.string().optional(),
})

// 各平台 Cookie 获取说明（显示在 Cookie 输入框下方）
const COOKIE_TIPS: Record<string, string> = {
  douyin:
    '抖音现在优先解析移动端分享页公开数据，通常不需要 Cookie。' +
    '可直接粘贴 v.douyin.com 短链、www.douyin.com/video|note 链接，或整段分享文案。',
  youtube:
    'YouTube 公开视频通常不需要 Cookie；遇到年龄限制、会员、登录校验或机器人校验时，' +
    '再选择浏览器读取 Cookie 或手动粘贴即可。',
  xiaohongshu:
    '小红书部分内容需登录 Cookie：登录 xiaohongshu.com 后从开发者工具复制完整 Cookie 粘贴于此。' +
    '链接可直接整段粘贴分享文案（会自动提取其中链接）。',
  bilibili:
    'B 站需要 Cookie 才能拿到字幕、以及更高清晰度：登录 bilibili.com 后复制完整 Cookie（含 SESSDATA）粘贴于此。',
  kuaishou: '快手部分内容需登录 Cookie：登录 kuaishou.com 后复制完整 Cookie 粘贴于此。',
}

const DownloaderForm = () => {
  const form = useForm({
    resolver: zodResolver(CookieSchema),
    defaultValues: { cookie: '', browser: 'none' },
  })
  const { getValues, reset } = form
  const { id } = useParams()

  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    const loadCookie = async () => {
      setLoading(true) // 🔁 切换平台时显示 loading
      try {
        const res = await getDownloaderCookie(id)
        const cookie = res?.cookie || ''
        const browser = res?.browser || 'none'
        reset({ cookie, browser }) // ✅ 正确重置表单值
      } catch (e) {
        toast.error('加载 Cookie 失败: ' + e)
        reset({ cookie: '', browser: 'none' })
      } finally {
        setLoading(false)
      }
    }

    if (id) loadCookie()
  }, [id, reset]) // 🔁 每当 id 变化时触发

  const onSubmit = async values => {
    if (!id) return
    try {
      await updateDownloaderCookie({
        platform: id,
        cookie: String(values.cookie || ''),
        // 'none' 表示不使用浏览器读 cookie，传空字符串让后端清除该设置
        browser: values.browser && values.browser !== 'none' ? values.browser : '',
      })
      toast.success('保存成功')
    } catch {
      toast.error('保存失败')
    }
  }

  const syncFromBrowser = async () => {
    const browser = getValues('browser')
    if (!id) return
    if (!browser || browser === 'none') {
      toast.error('请先选择一个已登录该平台的浏览器')
      return
    }

    setSyncing(true)
    try {
      const res = await syncDownloaderCookieFromBrowser({
        platform: id,
        browser,
      })
      reset({
        cookie: res.cookie || '',
        browser: res.browser || browser,
      })
      toast.success(`已从浏览器读取 ${res.count} 条 Cookie`)
    } catch (e) {
      console.error('从浏览器读取 Cookie 失败:', e)
    } finally {
      setSyncing(false)
    }
  }

  if (loading) return <div className="p-4">加载中...</div>

  const platformLabel = videoPlatforms.find(item => item.value === id)?.label || id
  const cookieOptional = id ? COOKIE_OPTIONAL_PLATFORMS.has(id) : false

  return (
    <div className="max-w-xl p-4">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="text-lg font-bold">
            {platformLabel}下载器 Cookie / Token{cookieOptional ? '（可选）' : ''}
          </div>
          {cookieOptional && (
            <div className="rounded-md bg-emerald-50 p-2 text-xs leading-relaxed text-emerald-700">
              当前平台多数公开内容无需 Cookie，保持为空也可以生成笔记；
              只有遇到登录校验、受限内容或下载失败时，再回来配置 Cookie。
            </div>
          )}

          <FormField
            control={form.control}
            name="cookie"
            render={({ field }) => (
              <FormItem className="flex flex-col gap-2">
                <FormLabel>Cookie</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder={cookieOptional ? '通常可留空，需要时再输入 Cookie' : '输入 Cookie'}
                  />
                </FormControl>
                {id && COOKIE_TIPS[id] && (
                  <div
                    className={
                      'rounded-md p-2 text-xs leading-relaxed ' +
                      (cookieOptional
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-700')
                    }
                  >
                    {COOKIE_TIPS[id]}
                  </div>
                )}
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="browser"
            render={({ field }) => (
              <FormItem className="flex flex-col gap-2">
                <FormLabel>从本地浏览器一键获取 Cookie / Token</FormLabel>
                <FormControl>
                  <div className="flex gap-2">
                    <Select value={field.value || 'none'} onValueChange={field.onChange}>
                      <SelectTrigger className="min-w-0 flex-1">
                        <SelectValue placeholder="选择浏览器" />
                      </SelectTrigger>
                      <SelectContent>
                        {BROWSER_OPTIONS.map(o => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0"
                      disabled={syncing || !id}
                      onClick={syncFromBrowser}
                    >
                      {syncing ? '读取中…' : '一键获取'}
                    </Button>
                  </div>
                </FormControl>
                <div className="text-xs text-gray-500">
                  {cookieOptional
                    ? '可选：遇到登录校验或受限内容时，选择已登录该平台的浏览器读取 Cookie。'
                    : '选定浏览器后会实时读取该浏览器 Cookie；需先在对应浏览器登录平台，' +
                      'macOS 首次访问 Chrome/Safari 的 Cookie 可能需要授权。'}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit">保存</Button>
        </form>
      </Form>
    </div>
  )
}

export default DownloaderForm
