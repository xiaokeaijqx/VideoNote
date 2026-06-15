import './App.css'
import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, HashRouter, Navigate, Routes, Route } from 'react-router-dom'
import { useTaskPolling } from '@/hooks/useTaskPolling.ts'
import { useCheckBackend } from '@/hooks/useCheckBackend.ts'
import { systemCheck } from '@/services/system.ts'
import { listCustomPlatforms } from '@/services/downloader.ts'
import { setCustomPlatforms } from '@/utils/platform'
import BackendInitDialog from '@/components/BackendInitDialog'
import StartupBanner from '@/components/SystemDiagnostic/StartupBanner'
import BackendHealthIndicator from '@/components/BackendHealth/BackendHealthIndicator'
import Index from '@/pages/Index.tsx'
import MainLayout from '@/layouts/MainLayout.tsx'
import { HomePage } from './pages/HomePage/Home.tsx'

// 非首屏页面使用 React.lazy 按需加载
const Onboarding = lazy(() => import('@/pages/Onboarding'))
const SettingPage = lazy(() => import('./pages/SettingPage/index.tsx'))
const Collections = lazy(() => import('@/pages/Collections'))
const CollectionDetail = lazy(() => import('@/pages/Collections/CollectionDetail'))
const Knowledge = lazy(() => import('@/pages/Knowledge'))
const TaskList = lazy(() => import('@/pages/TaskList'))
const BatchImport = lazy(() => import('@/pages/BatchImport'))
const Trends = lazy(() => import('@/pages/Trends'))
const Subscriptions = lazy(() => import('@/pages/Subscriptions'))
const Articles = lazy(() => import('@/pages/Articles'))
const Guide = lazy(() => import('@/pages/Guide'))

// 桌面端首启引导守卫：未完成 onboarding 时强制跳到 /onboarding
function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
  // 仅在 Tauri 桌面端拦截；纯 web 端不打扰用户
  if (!isTauri) return <>{children}</>
  if (localStorage.getItem('videomemo-onboarded') !== '1')
    return <Navigate to="/onboarding" replace />
  return <>{children}</>
}
const Model = lazy(() => import('@/pages/SettingPage/Model.tsx'))
const ProviderForm = lazy(() => import('@/components/Form/modelForm/Form.tsx'))
const AboutPage = lazy(() => import('@/pages/SettingPage/about.tsx'))
const Monitor = lazy(() => import('@/pages/SettingPage/Monitor.tsx'))
const Downloader = lazy(() => import('@/pages/SettingPage/Downloader.tsx'))
const DownloaderForm = lazy(() => import('@/components/Form/DownloaderForm/Form.tsx'))
const TranscriberPage = lazy(() => import('@/pages/SettingPage/transcriber.tsx'))
const FeishuPage = lazy(() => import('@/pages/SettingPage/Feishu.tsx'))
const LocalDownloaderPage = lazy(() => import('@/pages/SettingPage/LocalDownloader.tsx'))
const AccessPassword = lazy(() => import('@/pages/SettingPage/AccessPassword.tsx'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

function App() {
  useTaskPolling(3000) // 每 3 秒轮询一次
  const { loading, initialized, failed, lastError, retry } = useCheckBackend()

  // 在后端初始化完成后执行系统检查
  useEffect(() => {
    if (initialized) {
      systemCheck()
      // 预加载自定义平台列表，让 NoteForm/BatchImport 的 URL→平台自动识别能匹配它们
      listCustomPlatforms()
        .then(list => setCustomPlatforms(Array.isArray(list) ? list : []))
        .catch(() => setCustomPlatforms([]))
    }
  }, [initialized])

  // 如果后端还未初始化，显示初始化对话框（loading 或 failed 都展示，由 dialog 内部决定渲染哪一态）
  if (!initialized) {
    return (
      <>
        <StartupBanner />
        <BackendInitDialog open={loading} failed={failed} lastError={lastError} onRetry={retry} />
      </>
    )
  }

  // 桌面端使用 HashRouter 避免刷新 404；Web 端继续使用 BrowserRouter
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
  const Router = isTauri ? HashRouter : BrowserRouter

  // 后端已初始化，渲染主应用
  return (
    <>
      <StartupBanner />
      <BackendHealthIndicator />
      <Router>
        <Suspense
          fallback={<div className="flex h-screen items-center justify-center">加载中…</div>}
        >
          <Routes>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route
              path="/"
              element={
                <OnboardingGuard>
                  <Index />
                </OnboardingGuard>
              }
            >
              <Route element={<MainLayout />}>
                <Route index element={<HomePage />} />
                <Route path="collections" element={<Collections />} />
                <Route path="collections/:id" element={<CollectionDetail />} />
                <Route path="knowledge" element={<Knowledge />} />
                <Route path="tasks" element={<TaskList />} />
                <Route path="trends" element={<Trends />} />
                <Route path="subscriptions" element={<Subscriptions />} />
                <Route path="articles" element={<Articles />} />
                <Route path="batch-import" element={<BatchImport />} />
                <Route path="guide" element={<Guide />} />
                <Route path="settings" element={<SettingPage />}>
                  <Route index element={<Navigate to="model" replace />} />
                  <Route path="model" element={<Model />}>
                    <Route path="new" element={<ProviderForm isCreate />} />
                    <Route path=":id" element={<ProviderForm />} />
                  </Route>
                  <Route path="download" element={<Downloader />}>
                    <Route path=":id" element={<DownloaderForm />} />
                  </Route>
                  <Route path="transcriber" element={<TranscriberPage />} />
                  <Route path="feishu" element={<FeishuPage />} />
                  <Route path="local-downloader" element={<LocalDownloaderPage />} />
                  <Route path="access-password" element={<AccessPassword />} />
                  <Route path="monitor" element={<Monitor />}></Route>
                  <Route path="about" element={<AboutPage />}></Route>
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Route>
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </Suspense>
      </Router>
    </>
  )
}

export default App
