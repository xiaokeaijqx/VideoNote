import { useEffect, useRef } from 'react'
import { useTaskStore } from '@/store/taskStore'
import { get_task_status } from '@/services/note.ts'
import toast from 'react-hot-toast'

export const useTaskPolling = (interval = 3000) => {
  const tasks = useTaskStore(state => state.tasks)
  const updateTaskContent = useTaskStore(state => state.updateTaskContent)
  const updateTaskStatus = useTaskStore(state => state.updateTaskStatus)
  const removeTask = useTaskStore(state => state.removeTask)

  const tasksRef = useRef(tasks)

  // 每次 tasks 更新，把最新的 tasks 同步进去
  useEffect(() => {
    tasksRef.current = tasks
  }, [tasks])

  useEffect(() => {
    const timer = setInterval(async () => {
      const pendingTasks = tasksRef.current.filter(
        task => task.status != 'SUCCESS' && task.status != 'FAILED'
      )

      // 无活跃任务时跳过轮询
      if (pendingTasks.length === 0) return

      for (const task of pendingTasks) {
        try {
          const res = await get_task_status(task.id)
          const { status, paused, cache } = res

          if (status === 'SUCCESS' && status !== task.status) {
            const result = res.result || {}
            updateTaskContent(task.id, {
              status,
              markdown: result.markdown,
              transcript: result.transcript,
              audioMeta: result.audio_meta,
              totalTokens: result.total_tokens,
              paused: false,
              cache,
              completedAt: new Date().toISOString(), // 补记完成时间
            })
            toast.success('笔记生成成功')
          } else if (status === 'FAILED' && status !== task.status) {
            updateTaskContent(task.id, { status, paused: false })
            console.warn(`⚠️ 任务 ${task.id} 失败`)
          } else if (
            status &&
            (status !== task.status || !!paused !== !!task.paused || cache !== task.cache)
          ) {
            // 处理中：状态或暂停标记变化时同步
            updateTaskContent(task.id, { status, paused: !!paused, cache })
          }
        } catch (e) {
          console.error('❌ 任务轮询失败：', e)
          updateTaskContent(task.id, { status: 'FAILED' })
        }
      }
    }, interval)

    return () => clearInterval(timer)
  }, [interval])
}
