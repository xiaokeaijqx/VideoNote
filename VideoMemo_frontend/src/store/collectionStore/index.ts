import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'
import { get, set, del } from 'idb-keyval'

export interface Collection {
  id: string
  name: string
  description: string
  cover: string // base64 data URL，空字符串表示无封面
  tags: string[]
  noteIds: string[] // 关联的笔记(taskStore 任务)id
  createdAt: string
}

export type CollectionInput = Pick<Collection, 'name' | 'description' | 'cover' | 'tags'>

/**
 * 「未分组」虚拟合集 —— 不持久化，运行时从 (所有笔记) - (已被任何合集收录的笔记) 算出来。
 * 用户不能编辑 / 删除 / 增删笔记（要"加入"某个真实合集即可让它自动从未分组消失）。
 */
export const UNGROUPED_COLLECTION_ID = '__ungrouped__'

export function isUngroupedCollection(id?: string | null): boolean {
  return id === UNGROUPED_COLLECTION_ID
}

export function buildUngroupedCollection(
  allNoteIds: string[],
  realCollections: Collection[],
): Collection {
  const grouped = new Set<string>()
  for (const c of realCollections) {
    for (const nid of c.noteIds ?? []) grouped.add(nid)
  }
  const noteIds = allNoteIds.filter(id => !grouped.has(id))
  return {
    id: UNGROUPED_COLLECTION_ID,
    name: '未分组',
    description: '所有尚未归入任何合集的笔记',
    cover: '',
    tags: [],
    noteIds,
    createdAt: '',
  }
}

interface CollectionStore {
  collections: Collection[]
  addCollection: (input: CollectionInput) => void
  updateCollection: (id: string, input: CollectionInput) => void
  removeCollection: (id: string) => void
  getCollection: (id: string) => Collection | undefined
  setCollectionNotes: (id: string, noteIds: string[]) => void
  removeNoteFromCollection: (id: string, noteId: string) => void
}

export const useCollectionStore = create<CollectionStore>()(
  persist(
    (set, get) => ({
      collections: [],

      addCollection: input =>
        set(state => ({
          collections: [
            {
              id: uuidv4(),
              ...input,
              noteIds: [],
              createdAt: new Date().toISOString(),
            },
            ...state.collections,
          ],
        })),

      updateCollection: (id, input) =>
        set(state => ({
          collections: state.collections.map(c =>
            c.id === id ? { ...c, ...input } : c,
          ),
        })),

      removeCollection: id =>
        set(state => ({
          collections: state.collections.filter(c => c.id !== id),
        })),

      getCollection: id => get().collections.find(c => c.id === id),

      setCollectionNotes: (id, noteIds) =>
        set(state => ({
          collections: state.collections.map(c =>
            c.id === id ? { ...c, noteIds } : c,
          ),
        })),

      removeNoteFromCollection: (id, noteId) =>
        set(state => ({
          collections: state.collections.map(c =>
            c.id === id ? { ...c, noteIds: c.noteIds.filter(n => n !== noteId) } : c,
          ),
        })),
    }),
    {
      name: 'collection-storage',
      storage: createJSONStorage(() => ({
        getItem: async (name: string): Promise<string | null> => {
          const value = await get(name)
          return value ?? null
        },
        setItem: async (name: string, value: string): Promise<void> => {
          await set(name, value)
        },
        removeItem: async (name: string): Promise<void> => {
          await del(name)
        },
      })),
    },
  ),
)
