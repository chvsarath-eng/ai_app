import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { OutputType } from '@/types/storybook'

export interface CheckoutData {
  // Product info from generator
  imageFile: File | null
  imagePreviewUrl: string | null
  name: string
  age: number
  storyline: string
  email: string
  outputType: OutputType | null

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
}

interface CheckoutStore extends CheckoutData {
  // Actions
  setProductInfo: (data: {
    imageFile: File
    imagePreviewUrl: string
    name: string
    age: number
    storyline: string
    email: string
    outputType: OutputType
  }) => void
  setShippingAddress: (address: Partial<CheckoutData>) => void
  setShippingOption: (level: string, cost: number) => void
  setEmail: (email: string) => void
  reset: () => void
  isReady: () => boolean
}

const initialState: CheckoutData = {
  imageFile: null,
  imagePreviewUrl: null,
  name: '',
  age: 0,
  storyline: '',
  email: '',
  outputType: null,
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
  bookPrice: 39.99
}

export const useCheckoutStore = create<CheckoutStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      setProductInfo: (data) => set({
        imageFile: data.imageFile,
        imagePreviewUrl: data.imagePreviewUrl,
        name: data.name,
        age: data.age,
        storyline: data.storyline,
        email: data.email,
        outputType: data.outputType
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

      reset: () => set(initialState),

      isReady: () => {
        const state = get()
        return Boolean(
          state.imageFile &&
          state.name &&
          state.age > 0 &&
          state.storyline &&
          state.outputType
        )
      }
    }),
    {
      name: 'checkout-storage',
      // Only persist non-File data
      partialize: (state) => ({
        imagePreviewUrl: state.imagePreviewUrl,
        name: state.name,
        age: state.age,
        storyline: state.storyline,
        email: state.email,
        outputType: state.outputType,
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
        bookPrice: state.bookPrice
      })
    }
  )
)
