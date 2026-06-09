import { useEffect, useRef } from 'react'
import { useTaskStore } from '@/store/taskStore'
import { get_task_status } from '@/services/note.ts'
import toast from 'react-hot-toast'

const TERMINAL_STATUSES = new Set(['SUCCESS', 'FAILED'])
const successToastTaskIds = new Set<string>()

export const useTaskPolling = (interval = 3000) => {
  const updateTaskContent = useTaskStore(state => state.updateTaskContent)
  const inFlightRef = useRef(false)

  useEffect(() => {
    const pollTasks = async () => {
      if (inFlightRef.current) return

      const pendingTasks = useTaskStore
        .getState()
        .tasks.filter(task => !TERMINAL_STATUSES.has(task.status))

      if (pendingTasks.length === 0) return

      inFlightRef.current = true
      try {
        for (const task of pendingTasks) {
          const latestTask = useTaskStore.getState().tasks.find(item => item.id === task.id)
          if (!latestTask || TERMINAL_STATUSES.has(latestTask.status)) {
            continue
          }

          try {
            const res = await get_task_status(task.id)
            const { status, paused, cache } = res || {}
            if (!status) continue

            const currentTask = useTaskStore.getState().tasks.find(item => item.id === task.id)
            if (!currentTask || TERMINAL_STATUSES.has(currentTask.status)) {
              continue
            }

            if (status === 'SUCCESS') {
              const result = res.result || {}
              updateTaskContent(task.id, {
                status,
                markdown: result.markdown,
                transcript: result.transcript,
                audioMeta: result.audio_meta,
                totalTokens: result.total_tokens,
                paused: false,
                cache,
                completedAt: new Date().toISOString(),
              })
              if (!successToastTaskIds.has(task.id)) {
                successToastTaskIds.add(task.id)
                toast.success('笔记生成成功')
              }
            } else if (status === 'FAILED') {
              updateTaskContent(task.id, { status, paused: false })
              console.warn(`⚠️ 任务 ${task.id} 失败`)
            } else if (
              status !== currentTask.status ||
              !!paused !== !!currentTask.paused ||
              cache !== currentTask.cache
            ) {
              updateTaskContent(task.id, { status, paused: !!paused, cache })
            }
          } catch (e) {
            console.error('❌ 任务轮询失败：', e)
            updateTaskContent(task.id, { status: 'FAILED' })
          }
        }
      } finally {
        inFlightRef.current = false
      }
    }

    void pollTasks()
    const timer = setInterval(() => {
      void pollTasks()
    }, interval)

    return () => clearInterval(timer)
  }, [interval, updateTaskContent])
}
