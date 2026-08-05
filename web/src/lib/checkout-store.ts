import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { OutputType, CharacterInfo } from '@/types/storybook'

export interface CheckoutData {
  // Multi-character product info
  imageFiles: File[]
  imagePreviewUrls: string[]
  characters: CharacterInfo[]
  storyline: string
  email: string
  outputType: OutputType | null
  discountCode: string

  // Shipping address
  shippingName: string
  shippingPhone: string
  shippingAddress1: string
  shippingAddress2: string
  shippingCity: string
  shippingRegion: string
  shippingPostalCode: string
  shippingCountry: string

  // Selected shipping option
  selectedShippingLevel: string | null
  shippingCost: number
  bookPrice: number
  pendingCheckoutSessionId: string | null
}

interface CheckoutStore extends CheckoutData {
  setProductInfo: (data: {
    imageFiles: File[]
    imagePreviewUrls: string[]
    characters: CharacterInfo[]
    storyline: string
    outputType: OutputType
  }) => void
  restoreImageFiles: (imageFiles: File[], imagePreviewUrls: string[]) => void
  setShippingAddress: (address: Partial<CheckoutData>) => void
  setShippingOption: (level: string, cost: number) => void
  setEmail: (email: string) => void
  setDiscountCode: (discountCode: string) => void
  setPendingCheckout: (sessionId: string) => void
  clearPendingCheckout: () => void
  reset: () => void
  isReady: () => boolean
}

const initialState: CheckoutData = {
  imageFiles: [],
  imagePreviewUrls: [],
  characters: [],
  storyline: '',
  email: '',
  outputType: null,
  discountCode: '',
  shippingName: '',
  shippingPhone: '',
  shippingAddress1: '',
  shippingAddress2: '',
  shippingCity: '',
  shippingRegion: '',
  shippingPostalCode: '',
  shippingCountry: '',
  selectedShippingLevel: null,
  shippingCost: 0,
  bookPrice: 39.99,
  pendingCheckoutSessionId: null
}

export const useCheckoutStore = create<CheckoutStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      setProductInfo: (data) => set({
        imageFiles: data.imageFiles,
        imagePreviewUrls: data.imagePreviewUrls,
        characters: data.characters,
        storyline: data.storyline,
        outputType: data.outputType
      }),

      restoreImageFiles: (imageFiles, imagePreviewUrls) => set({
        imageFiles,
        imagePreviewUrls
      }),

      setShippingAddress: (address) => set((state) => ({
        ...state,
        ...address
      })),

      setShippingOption: (level, cost) => set({
        selectedShippingLevel: level,
        shippingCost: cost
      }),

      setEmail: (email) => set({ email }),
      setDiscountCode: (discountCode) => set({ discountCode }),
      setPendingCheckout: (sessionId) => set({ pendingCheckoutSessionId: sessionId }),
      clearPendingCheckout: () => set({ pendingCheckoutSessionId: null }),

      reset: () => set(initialState),

      isReady: () => {
        const state = get()
        return Boolean(
          state.imageFiles.length > 0 &&
          state.characters.length > 0 &&
          state.characters[0]?.name &&
          state.characters[0]?.age > 0 &&
          state.storyline &&
          state.outputType
        )
      }
    }),
    {
      name: 'checkout-storage',
      partialize: (state) => ({
        imagePreviewUrls: state.imagePreviewUrls,
        characters: state.characters,
        storyline: state.storyline,
        email: state.email,
        outputType: state.outputType,
        discountCode: state.discountCode,
        shippingName: state.shippingName,
        shippingPhone: state.shippingPhone,
        shippingAddress1: state.shippingAddress1,
        shippingAddress2: state.shippingAddress2,
        shippingCity: state.shippingCity,
        shippingRegion: state.shippingRegion,
        shippingPostalCode: state.shippingPostalCode,
        shippingCountry: state.shippingCountry,
        selectedShippingLevel: state.selectedShippingLevel,
        shippingCost: state.shippingCost,
        bookPrice: state.bookPrice,
        pendingCheckoutSessionId: state.pendingCheckoutSessionId
      })
    }
  )
)
