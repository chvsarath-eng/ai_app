/**
 * Lulu API Client
 * 
 * Handles OAuth2 authentication and API calls to Lulu Print API
 * for shipping cost calculation and address validation.
 * 
 * Required env vars:
 * - LULU_CLIENT_ID or LULU_CLIENT_KEY
 * - LULU_CLIENT_SECRET
 * - LULU_API_BASE (default: https://api.sandbox.lulu.com)
 */

// Hardcover book spec: 8.5x8.5 Color Hardcover Casewrap Matte 24 pages
export const POD_PACKAGE_ID = '0850X0850FCPRECW080CW444MXX'
export const INTERIOR_PAGE_COUNT = 24
export const BOOK_BASE_PRICE_USD = 39.99

export interface ShippingAddress {
  name: string
  street1: string
  street2?: string
  city: string
  state_code: string
  postcode: string
  country_code: string
  phone_number?: string
}

export interface ShippingOption {
  level: 'MAIL' | 'PRIORITY_MAIL' | 'GROUND_HD' | 'GROUND_BUS' | 'EXPEDITED' | 'EXPRESS'
  cost: number
  currency: string
  description: string
}

export interface CostCalculationResult {
  valid: boolean
  shipping_options: ShippingOption[]
  book_manufacturing_cost: number
  currency: string
  errors?: string[]
}

// Token cache
let cachedToken: string | null = null
let tokenExpiry: number = 0

/**
 * Get Lulu API configuration from environment
 */
function getConfig() {
  const clientId = process.env.LULU_CLIENT_ID || process.env.LULU_CLIENT_KEY
  const clientSecret = process.env.LULU_CLIENT_SECRET
  const apiBase = process.env.LULU_API_BASE || 'https://api.sandbox.lulu.com'
  
  if (!clientId || !clientSecret) {
    throw new Error('LULU_CLIENT_ID and LULU_CLIENT_SECRET must be set')
  }
  
  return { clientId, clientSecret, apiBase }
}

/**
 * Get OAuth2 access token from Lulu
 */
async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < tokenExpiry - 60000) {
    return cachedToken
  }
  
  const { clientId, clientSecret, apiBase } = getConfig()
  
  // Determine token URL based on environment
  const isSandbox = apiBase.includes('sandbox')
  const tokenUrl = isSandbox
    ? 'https://api.sandbox.lulu.com/auth/realms/glasstree/protocol/openid-connect/token'
    : 'https://api.lulu.com/auth/realms/glasstree/protocol/openid-connect/token'
  
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret
    })
  })
  
  if (!response.ok) {
    const text = await response.text()
    console.error('Lulu auth failed:', response.status, text)
    throw new Error(`Lulu authentication failed: ${response.status}`)
  }
  
  const data = await response.json()
  cachedToken = data.access_token
  // expires_in is in seconds, convert to milliseconds
  tokenExpiry = Date.now() + (data.expires_in * 1000)
  
  return cachedToken
}

/**
 * Make authenticated request to Lulu API
 */
async function luluRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const { apiBase } = getConfig()
  const token = await getAccessToken()
  
  const url = `${apiBase}${endpoint}`
  
  return fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  })
}

/**
 * Shipping level descriptions
 */
const SHIPPING_DESCRIPTIONS: Record<string, string> = {
  'MAIL': 'Standard Mail (7-21 business days)',
  'PRIORITY_MAIL': 'Priority Mail (3-7 business days)',
  'GROUND_HD': 'Ground Home Delivery (5-10 business days)',
  'GROUND_BUS': 'Ground Business (5-10 business days)',
  'EXPEDITED': 'Expedited (3-5 business days)',
  'EXPRESS': 'Express (1-3 business days)'
}

/**
 * Calculate shipping cost and get available shipping options
 * 
 * This calls Lulu's shipping-options endpoint which:
 * - Returns all available shipping options with costs
 * - Validates the shipping address
 */
export async function calculateShippingCost(
  shippingAddress: ShippingAddress,
  quantity: number = 1
): Promise<CostCalculationResult> {
  // Build payload for /shipping-options/ endpoint
  // Note: Uses 'country' not 'country_code', and doesn't need name/phone
  const payload = {
    currency: 'USD',
    line_items: [
      {
        quantity,
        pod_package_id: POD_PACKAGE_ID,
        page_count: INTERIOR_PAGE_COUNT
      }
    ],
    shipping_address: {
      street1: shippingAddress.street1,
      city: shippingAddress.city,
      state_code: shippingAddress.state_code,
      postcode: shippingAddress.postcode,
      country: shippingAddress.country_code  // Note: 'country' not 'country_code'
    }
  }
  
  console.log('Lulu shipping-options request:', JSON.stringify(payload, null, 2))
  
  try {
    const response = await luluRequest('/shipping-options/', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('Lulu shipping-options failed:', response.status, errorText)
      
      // Try to parse error as JSON
      let errorData: Record<string, unknown> = {}
      try {
        errorData = JSON.parse(errorText)
      } catch {
        // Not JSON, use text as error
      }
      
      // Extract error messages
      const errors: string[] = []
      if (errorData.shipping_address) {
        for (const [field, messages] of Object.entries(errorData.shipping_address as Record<string, unknown>)) {
          if (Array.isArray(messages)) {
            errors.push(`${field}: ${messages.join(', ')}`)
          } else if (typeof messages === 'string') {
            errors.push(`${field}: ${messages}`)
          }
        }
      }
      if (errorData.detail) {
        errors.push(String(errorData.detail))
      }
      if (errorData.non_field_errors && Array.isArray(errorData.non_field_errors)) {
        errors.push(...errorData.non_field_errors.map(String))
      }
      if (errors.length === 0 && errorText) {
        errors.push(errorText.substring(0, 200))
      }
      
      return {
        valid: false,
        shipping_options: [],
        book_manufacturing_cost: 0,
        currency: 'USD',
        errors: errors.length > 0 ? errors : ['Address validation failed']
      }
    }
    
    // Response is an array of shipping options
    const data = await response.json()
    console.log('Lulu shipping-options response:', JSON.stringify(data, null, 2))
    
    // Parse shipping options from response (array format)
    const shippingOptions: ShippingOption[] = []
    
    if (Array.isArray(data)) {
      for (const option of data) {
        // cost_excl_tax is a string like "5.99"
        const cost = option.cost_excl_tax 
          ? parseFloat(option.cost_excl_tax) 
          : 0
        
        shippingOptions.push({
          level: option.level,
          cost,
          currency: option.currency || 'USD',
          description: SHIPPING_DESCRIPTIONS[option.level] || option.level
        })
      }
    }
    
    // Sort by cost (cheapest first)
    shippingOptions.sort((a, b) => a.cost - b.cost)
    
    return {
      valid: true,
      shipping_options: shippingOptions,
      book_manufacturing_cost: 0, // Not returned by this endpoint
      currency: 'USD',
      errors: undefined
    }
  } catch (error) {
    console.error('Lulu API error:', error)
    return {
      valid: false,
      shipping_options: [],
      book_manufacturing_cost: 0,
      currency: 'USD',
      errors: ['Failed to connect to shipping service']
    }
  }
}

/**
 * Test connection to Lulu API
 */
export async function pingLulu(): Promise<boolean> {
  try {
    const response = await luluRequest('/print-jobs/statistics/')
    return response.ok
  } catch {
    return false
  }
}
