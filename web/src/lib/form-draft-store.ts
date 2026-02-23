import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type CharacterDraft = {
  imageFile?: File
  imagePreviewUrl?: string
  name: string
  age: number | undefined
  gender: string
  relationship: string
}

interface FormDraftStore {
  characters: CharacterDraft[]
  storyline: string
  outputType: string | undefined
  
  setDraft: (data: {
    characters: CharacterDraft[]
    storyline: string
    outputType?: string
  }) => void
  
  getDraft: () => {
    characters: CharacterDraft[]
    storyline: string
    outputType: string | undefined
  }
  
  clearDraft: () => void
  
  hasDraft: () => boolean
}

const initialState = {
  characters: [],
  storyline: '',
  outputType: undefined
}

export const useFormDraftStore = create<FormDraftStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      setDraft: (data) => set({
        characters: data.characters,
        storyline: data.storyline,
        outputType: data.outputType
      }),

      getDraft: () => {
        const state = get()
        return {
          characters: state.characters,
          storyline: state.storyline,
          outputType: state.outputType
        }
      },

      clearDraft: () => set(initialState),

      hasDraft: () => {
        const state = get()
        return state.characters.length > 0
      }
    }),
    {
      name: 'form-draft-storage',
      partialize: (state) => ({
        characters: state.characters.map(c => ({
          ...c,
          imageFile: undefined
        })),
        storyline: state.storyline,
        outputType: state.outputType
      })
    }
  )
)
