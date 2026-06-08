import { FC, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Plus } from 'lucide-react'
import MarkdownViewer from '@/pages/HomePage/components/MarkdownViewer.tsx'
import NewNoteRedesigned from '@/pages/HomePage/NewNoteRedesigned.tsx'
import WorkspaceLayout from '@/pages/HomePage/WorkspaceLayout.tsx'
import { EmptyTasksArt } from '@/components/design/animations'
import { useTaskStore } from '@/store/taskStore'
import { trVm, useVmLang } from '@/i18n/redesign'

type ViewStatus = 'idle' | 'loading' | 'success' | 'failed'

/**
 * `/` 工作区行为：
 * - 默认展示「笔记列表」工作区布局（左侧 rail + 右侧内容区）
 * - 选中某条笔记：右侧渲染 MarkdownViewer
 * - 未选中任何笔记（点了「+ 新建笔记」清空了当前选中）：右侧渲染新建笔记表单
 * - 还没有任何笔记：直接显示空状态卡片，提示新建第一篇
 */
export const HomePage: FC = () => {
  const lang = useVmLang()
  const location = useLocation()
  const tasks = useTaskStore(state => state.tasks)
  const currentTaskId = useTaskStore(state => state.currentTaskId)
  const setCurrentTask = useTaskStore(state => state.setCurrentTask)

  const currentTask = tasks.find(t => t.id === currentTaskId)
  const [status, setStatus] = useState<ViewStatus>('idle')

  // 「没有任何笔记」时是否已经主动进入新建状态。点了 CTA 才显示表单，
  // 避免一进来就看到一大堆表单字段，欢迎体验更柔和。
  const [createMode, setCreateMode] = useState(false)

  useEffect(() => {
    const state = location.state as { createFromHot?: boolean } | null
    if (!state?.createFromHot) return
    setCurrentTask(null)
    setCreateMode(true)
  }, [location.state, setCurrentTask])

  useEffect(() => {
    if (!currentTask) {
      setStatus('idle')
    } else if (currentTask.status === 'SUCCESS') {
      setStatus('success')
    } else if (currentTask.status === 'FAILED') {
      setStatus('failed')
    } else {
      setStatus('loading')
    }
  }, [currentTask, currentTask?.status])

  // 零笔记 + 未点 CTA：展示欢迎空状态
  if (tasks.length === 0 && !createMode) {
    return (
      <div className="vm-content-inner narrow vm-fade-up" style={{ paddingTop: 56 }}>
        <div className="vm-card" style={{ padding: '56px 24px', textAlign: 'center' }}>
          <EmptyTasksArt />
          <div style={{ fontSize: 19, fontWeight: 800, marginTop: 8 }}>
            {trVm('emptyTasks', lang)}
          </div>
          <div className="vm-muted" style={{ marginTop: 6, fontSize: 14 }}>
            {trVm('emptyTasksSub', lang)}
          </div>
          <button
            className="vm-btn vm-btn-primary"
            style={{ margin: '20px auto 0' }}
            onClick={() => {
              setCurrentTask(null)
              setCreateMode(true)
            }}
          >
            <Plus size={17} />
            {trVm('emptyTasksCta', lang)}
          </button>
        </div>
      </div>
    )
  }

  // 零笔记 + 已点 CTA：全屏展示新建笔记表单
  if (tasks.length === 0) {
    return <NewNoteRedesigned />
  }

  // 有笔记：工作区布局；右侧根据是否选中显示阅读器或新建表单
  const right = currentTaskId ? (
    <MarkdownViewer status={status} />
  ) : (
    <NewNoteRedesigned />
  )
  return <WorkspaceLayout Preview={right} />
}
