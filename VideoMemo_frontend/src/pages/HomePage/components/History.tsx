import NoteHistory from '@/pages/HomePage/components/NoteHistory.tsx'
import { useTaskStore } from '@/store/taskStore'
import { Plus } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area.tsx'

interface IProps {
  onNewNote?: () => void
  onSelectNote?: () => void
}

const History = ({ onNewNote, onSelectNote }: IProps) => {
  const currentTaskId = useTaskStore(state => state.currentTaskId)
  const setCurrentTask = useTaskStore(state => state.setCurrentTask)

  const openCreate = () => {
    // 新建前清空当前任务，让表单处于「生成笔记」而非「重新生成」状态
    setCurrentTask(null)
    onNewNote?.()
  }

  const handleSelect = (id: string) => {
    setCurrentTask(id)
    onSelectNote?.()
  }

  return (
    <div className={'flex h-full w-full flex-col gap-3 px-2.5 py-3'}>
      <button
        onClick={openCreate}
        className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 font-medium text-white transition-colors hover:bg-blue-700"
      >
        <Plus className="h-5 w-5" />
        新建笔记
      </button>
      <ScrollArea className="w-full sm:h-[480px] md:h-[720px] lg:h-[92%]">
        <NoteHistory onSelect={handleSelect} selectedId={currentTaskId} />
      </ScrollArea>
    </div>
  )
}

export default History
