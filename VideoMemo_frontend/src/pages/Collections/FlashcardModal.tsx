import { FC, useEffect, useState } from 'react'
import { Loader2, RotateCcw, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx'
import { Button } from '@/components/ui/button.tsx'
import { generateFlashcards, type Flashcard } from '@/services/flashcard'

interface IProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  content: string
  providerId?: string
  modelName?: string
}

const FlashcardModal: FC<IProps> = ({ open, onOpenChange, content, providerId, modelName }) => {
  const [loading, setLoading] = useState(false)
  const [cards, setCards] = useState<Flashcard[]>([])
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)

  const run = async () => {
    if (!providerId || !modelName) {
      toast.error('未找到可用模型，请先在工作区生成过笔记或配置模型')
      return
    }
    if (!content.trim()) {
      toast.error('合集内没有可用的笔记内容')
      return
    }
    setLoading(true)
    try {
      const res = await generateFlashcards({
        content,
        provider_id: providerId,
        model_name: modelName,
        count: 12,
      })
      setCards(res.cards)
      setIndex(0)
      setFlipped(false)
      if (!res.cards.length) toast.error('未能生成闪卡，请重试')
    } catch (e: any) {
      toast.error(e?.data?.msg || e?.message || '生成闪卡失败')
    } finally {
      setLoading(false)
    }
  }

  // 打开时若还没有卡片则自动生成一次
  useEffect(() => {
    if (open && cards.length === 0 && !loading) run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const card = cards[index]
  const prev = () => {
    setFlipped(false)
    setIndex(i => Math.max(0, i - 1))
  }
  const next = () => {
    setFlipped(false)
    setIndex(i => Math.min(cards.length - 1, i + 1))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-500" />
            闪卡学习
          </DialogTitle>
          <DialogDescription>
            由 AI 根据合集内笔记生成问答卡，点击卡片翻面。
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-gray-500">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            正在生成闪卡…
          </div>
        ) : cards.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-gray-500">
            <span>暂无闪卡</span>
            <Button onClick={run}>开始生成</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div
              onClick={() => setFlipped(f => !f)}
              className="flex min-h-[14rem] cursor-pointer select-none flex-col items-center justify-center rounded-xl border border-neutral-200 bg-gradient-to-br from-blue-50 to-white p-6 text-center shadow-sm transition-transform hover:scale-[1.01]"
            >
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-blue-400">
                {flipped ? '答案' : '问题'}
              </div>
              <div className="text-lg font-medium leading-relaxed text-gray-800">
                {flipped ? card.back : card.front}
              </div>
              <div className="mt-4 text-xs text-gray-400">点击翻面</div>
            </div>

            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={prev} disabled={index === 0}>
                <ChevronLeft className="h-4 w-4" />
                上一张
              </Button>
              <span className="text-sm text-gray-500">
                {index + 1} / {cards.length}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={next}
                disabled={index === cards.length - 1}
              >
                下一张
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex justify-center">
              <Button variant="ghost" size="sm" onClick={run}>
                <RotateCcw className="h-4 w-4" />
                重新生成
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default FlashcardModal
