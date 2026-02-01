import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Base prices in USD
const BASE_PRICES = {
  digital: 14.99,
  hardcover: 39.99
}

// Currency symbols mapping
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', INR: '₹',
  JPY: '¥', AUD: 'A$', CAD: 'C$', BRL: 'R$',
  CNY: '¥', KRW: '₩', MXN: '$', SGD: 'S$',
  CHF: 'CHF', HKD: 'HK$', SEK: 'kr', NOK: 'kr',
  DKK: 'kr', NZD: 'NZ$', ZAR: 'R', THB: '฿',
  PLN: 'zł', CZK: 'Kč', HUF: 'Ft', TRY: '₺',
  ILS: '₪', PHP: '₱', MYR: 'RM', IDR: 'Rp',
  RON: 'lei', ISK: 'kr'
}

// Currencies supported by Frankfurter API (ECB rates)
const SUPPORTED_CURRENCIES = new Set([
  'USD', 'EUR', 'GBP', 'INR', 'JPY', 'AUD', 'CAD', 'BRL',
  'CNY', 'CHF', 'HKD', 'KRW', 'MXN', 'SGD', 'THB', 'TRY',
  'ZAR', 'SEK', 'NOK', 'DKK', 'NZD', 'PLN', 'CZK', 'HUF',
  'ILS', 'PHP', 'MYR', 'IDR', 'RON', 'ISK', 'BGN'
])

// Format price with currency symbol
function formatPrice(amount: number, currencyCode: string, symbol: string): string {
  // Currencies that typically don't use decimals
  const noDecimalCurrencies = ['JPY', 'KRW', 'IDR', 'VND', 'HUF']
  const useDecimals = !noDecimalCurrencies.includes(currencyCode)
  
  const formattedAmount = useDecimals 
    ? amount.toFixed(2) 
    : Math.round(amount).toLocaleString()
  
  // Symbol-after currencies
  const symbolAfterCurrencies = ['SEK', 'NOK', 'DKK', 'ISK', 'CZK', 'PLN', 'HUF']
  if (symbolAfterCurrencies.includes(currencyCode)) {
    return `${formattedAmount} ${symbol}`
  }
  
  return `${symbol}${formattedAmount}`
}

// Default USD response
const DEFAULT_RESPONSE = {
  currencyCode: 'USD',
  currencySymbol: '$',
  digital: { price: '$14.99', priceRaw: 1499 },
  hardcover: { price: '$39.99', priceRaw: 3999 },
  isLocalized: false
}

export async function GET(request: NextRequest) {
  try {
    // Get client IP from headers (Cloud Run sets x-forwarded-for)
    const forwardedFor = request.headers.get('x-forwarded-for')
    const realIp = request.headers.get('x-real-ip')
    const clientIp = forwardedFor?.split(',')[0]?.trim() || realIp || null

    // Skip localization for local IPs
    if (!clientIp || clientIp === '127.0.0.1' || clientIp === '::1') {
      return NextResponse.json(DEFAULT_RESPONSE)
    }

    // Step 1: Detect user's country and currency from IP using ipapi.co
    const geoResponse = await fetch(`https://ipapi.co/${clientIp}/json/`, {
      headers: { 'User-Agent': 'img2x/1.0' }
    })
    
    if (!geoResponse.ok) {
      console.error('ipapi.co failed:', geoResponse.status)
      return NextResponse.json(DEFAULT_RESPONSE)
    }
    
    const geoData = await geoResponse.json()
    const detectedCurrency = geoData.currency || 'USD'
    
    console.log('Detected location:', {
      ip: clientIp,
      country: geoData.country,
      currency: detectedCurrency
    })

    // If USD or unsupported currency, return default
    if (detectedCurrency === 'USD' || !SUPPORTED_CURRENCIES.has(detectedCurrency)) {
      return NextResponse.json(DEFAULT_RESPONSE)
    }

    // Step 2: Get exchange rate from Frankfurter
    const rateResponse = await fetch(
      `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${detectedCurrency}`
    )
    
    if (!rateResponse.ok) {
      console.error('Frankfurter failed:', rateResponse.status)
      return NextResponse.json(DEFAULT_RESPONSE)
    }
    
    const rateData = await rateResponse.json()
    const rate = rateData.rates?.[detectedCurrency]
    
    if (!rate) {
      console.error('No rate found for', detectedCurrency)
      return NextResponse.json(DEFAULT_RESPONSE)
    }

    // Step 3: Convert prices
    const symbol = CURRENCY_SYMBOLS[detectedCurrency] || detectedCurrency
    const digitalLocal = BASE_PRICES.digital * rate
    const hardcoverLocal = BASE_PRICES.hardcover * rate

    return NextResponse.json({
      currencyCode: detectedCurrency,
      currencySymbol: symbol,
      digital: {
        price: formatPrice(digitalLocal, detectedCurrency, symbol),
        priceRaw: Math.round(digitalLocal * 100)
      },
      hardcover: {
        price: formatPrice(hardcoverLocal, detectedCurrency, symbol),
        priceRaw: Math.round(hardcoverLocal * 100)
      },
      isLocalized: true
    })
  } catch (error) {
    console.error('Localization error:', error)
    return NextResponse.json(DEFAULT_RESPONSE)
  }
}
