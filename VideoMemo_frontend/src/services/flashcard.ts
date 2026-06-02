import request from '@/utils/request'

export interface Flashcard {
  front: string
  back: string
}

export const generateFlashcards = async (data: {
  content: string
  provider_id: string
  model_name: string
  count?: number
}): Promise<{ cards: Flashcard[] }> => {
  return await request.post('/flashcards/generate', data, { timeout: 120000 })
}
