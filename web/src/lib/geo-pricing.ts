/**
 * Country-aware catalog prices for a worldwide storefront.
 * Book amounts are PPP-rounded (not raw FX) so India stays ₹799 / ₹2,999
 * while the US sees $9.99 / $39.99 and the UK sees £7.99 / £29.99.
 * Checkout charges the same currency that is displayed.
 */

import { formatMinor, getCurrencySymbol } from '@/lib/money'

export { formatMinor, getCurrencySymbol, usdMajorToMinor } from '@/lib/money'

export const USD_DIGITAL_MINOR = Number(process.env.RAZORPAY_AMOUNT_DIGITAL_USD || process.env.STRIPE_AMOUNT_DIGITAL_CENTS || 999)
export const USD_HARDCOVER_MINOR = Number(process.env.RAZORPAY_AMOUNT_HARDCOVER_USD || process.env.STRIPE_AMOUNT_HARDCOVER_CENTS || 3999)
export const INR_DIGITAL_MINOR = Number(process.env.RAZORPAY_AMOUNT_DIGITAL_INR || 79900)
export const INR_HARDCOVER_MINOR = Number(process.env.RAZORPAY_AMOUNT_HARDCOVER_INR || 299900)

export type LocalizedQuote = {
  countryCode: string
  countryName: string
  currencyCode: string
  currencySymbol: string
  locale: string
  exponent: number
  digitalMinor: number
  hardcoverMinor: number
  digitalPrice: string
  hardcoverPrice: string
  usdToLocal: number
  isLocalized: boolean
}

type CatalogRow = {
  digital: number
  hardcover: number
  locale: string
  usdToLocal: number
}

const CURATED: Record<string, CatalogRow> = {
  USD: { digital: USD_DIGITAL_MINOR, hardcover: USD_HARDCOVER_MINOR, locale: 'en-US', usdToLocal: 1 },
  INR: { digital: INR_DIGITAL_MINOR, hardcover: INR_HARDCOVER_MINOR, locale: 'en-IN', usdToLocal: 84 },
  GBP: { digital: 799, hardcover: 2999, locale: 'en-GB', usdToLocal: 0.79 },
  EUR: { digital: 999, hardcover: 3999, locale: 'en-IE', usdToLocal: 0.92 },
  CAD: { digital: 1399, hardcover: 5499, locale: 'en-CA', usdToLocal: 1.36 },
  AUD: { digital: 1499, hardcover: 5999, locale: 'en-AU', usdToLocal: 1.52 },
  NZD: { digital: 1699, hardcover: 6499, locale: 'en-NZ', usdToLocal: 1.64 },
  SGD: { digital: 1299, hardcover: 5299, locale: 'en-SG', usdToLocal: 1.35 },
  AED: { digital: 3699, hardcover: 14699, locale: 'en-AE', usdToLocal: 3.67 },
  SAR: { digital: 3799, hardcover: 14999, locale: 'en-SA', usdToLocal: 3.75 },
  QAR: { digital: 3699, hardcover: 14699, locale: 'en-QA', usdToLocal: 3.64 },
  HKD: { digital: 7800, hardcover: 31200, locale: 'en-HK', usdToLocal: 7.82 },
  MYR: { digital: 4499, hardcover: 17900, locale: 'en-MY', usdToLocal: 4.45 },
  CHF: { digital: 899, hardcover: 3590, locale: 'de-CH', usdToLocal: 0.89 },
  SEK: { digital: 10900, hardcover: 42900, locale: 'sv-SE', usdToLocal: 10.6 },
  NOK: { digital: 10900, hardcover: 42900, locale: 'nb-NO', usdToLocal: 10.7 },
  DKK: { digital: 6990, hardcover: 27900, locale: 'da-DK', usdToLocal: 6.85 },
  PLN: { digital: 3999, hardcover: 15900, locale: 'pl-PL', usdToLocal: 3.9 },
  CZK: { digital: 22900, hardcover: 89900, locale: 'cs-CZ', usdToLocal: 22.8 },
  HUF: { digital: 369000, hardcover: 1499000, locale: 'hu-HU', usdToLocal: 370 },
  RON: { digital: 4599, hardcover: 17900, locale: 'ro-RO', usdToLocal: 4.55 },
  ZAR: { digital: 17900, hardcover: 69900, locale: 'en-ZA', usdToLocal: 18.2 },
  PHP: { digital: 54900, hardcover: 219900, locale: 'en-PH', usdToLocal: 57 },
  THB: { digital: 34900, hardcover: 139000, locale: 'th-TH', usdToLocal: 35.5 },
  MXN: { digital: 19900, hardcover: 79900, locale: 'es-MX', usdToLocal: 18.5 },
  BRL: { digital: 4990, hardcover: 19900, locale: 'pt-BR', usdToLocal: 5.4 },
  TRY: { digital: 39900, hardcover: 159900, locale: 'tr-TR', usdToLocal: 34 },
  ILS: { digital: 3690, hardcover: 14900, locale: 'he-IL', usdToLocal: 3.7 },
  PKR: { digital: 279900, hardcover: 1099900, locale: 'en-PK', usdToLocal: 278 },
  BDT: { digital: 119900, hardcover: 479900, locale: 'en-BD', usdToLocal: 118 },
  LKR: { digital: 299900, hardcover: 1199900, locale: 'en-LK', usdToLocal: 300 },
  NPR: { digital: 129900, hardcover: 519900, locale: 'en-NP', usdToLocal: 134 },
  EGP: { digital: 49900, hardcover: 199900, locale: 'en-EG', usdToLocal: 50 },
  NGN: { digital: 1499900, hardcover: 5999900, locale: 'en-NG', usdToLocal: 1550 },
  KES: { digital: 129900, hardcover: 519900, locale: 'en-KE', usdToLocal: 129 },
  GHS: { digital: 11900, hardcover: 47900, locale: 'en-GH', usdToLocal: 12 },
  MAD: { digital: 9900, hardcover: 39900, locale: 'fr-MA', usdToLocal: 9.9 }
}

/** Razorpay international currencies we will actually charge. Others display/charge USD. */
const CHARGE_CURRENCIES = new Set(Object.keys(CURATED))

const COUNTRY_CURRENCY: Record<string, string> = {}

function mapCountries (currency: string, countries: string[]) {
  for (const country of countries) COUNTRY_CURRENCY[country] = currency
}

mapCountries('EUR', ['AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK', 'AD', 'MC', 'ME', 'SM', 'VA', 'XK', 'GF', 'GP', 'MQ', 'RE', 'YT', 'BL', 'MF', 'PM', 'TF', 'IC', 'EA'])
mapCountries('USD', ['US', 'PR', 'GU', 'AS', 'MP', 'VI', 'UM', 'EC', 'SV', 'PA', 'PW', 'FM', 'MH', 'TL', 'ZW', 'VG', 'BQ', 'IO'])
mapCountries('GBP', ['GB', 'IM', 'JE', 'GG', 'GS'])
mapCountries('INR', ['IN'])
mapCountries('CAD', ['CA'])
mapCountries('AUD', ['AU', 'CX', 'CC', 'NF', 'HM', 'KI', 'NR', 'TV'])
mapCountries('NZD', ['NZ', 'CK', 'NU', 'PN', 'TK'])
mapCountries('SGD', ['SG'])
mapCountries('AED', ['AE'])
mapCountries('SAR', ['SA'])
mapCountries('QAR', ['QA'])
mapCountries('HKD', ['HK'])
mapCountries('MYR', ['MY'])
mapCountries('CHF', ['CH', 'LI'])
mapCountries('SEK', ['SE'])
mapCountries('NOK', ['NO', 'SJ', 'BV'])
mapCountries('DKK', ['DK', 'FO', 'GL'])
mapCountries('PLN', ['PL'])
mapCountries('CZK', ['CZ'])
mapCountries('HUF', ['HU'])
mapCountries('RON', ['RO'])
mapCountries('ZAR', ['ZA', 'LS', 'NA', 'SZ'])
mapCountries('PHP', ['PH'])
mapCountries('THB', ['TH'])
mapCountries('MXN', ['MX'])
mapCountries('BRL', ['BR'])
mapCountries('TRY', ['TR'])
mapCountries('ILS', ['IL', 'PS'])
mapCountries('PKR', ['PK'])
mapCountries('BDT', ['BD'])
mapCountries('LKR', ['LK'])
mapCountries('NPR', ['NP'])
mapCountries('EGP', ['EG'])
mapCountries('NGN', ['NG'])
mapCountries('KES', ['KE'])
mapCountries('GHS', ['GH'])
mapCountries('MAD', ['MA', 'EH'])

const TIMEZONE_COUNTRY: Record<string, string> = {
  'Africa/Cairo': 'EG',
  'Africa/Johannesburg': 'ZA',
  'Africa/Lagos': 'NG',
  'Africa/Nairobi': 'KE',
  'Africa/Accra': 'GH',
  'Africa/Casablanca': 'MA',
  'America/Argentina/Buenos_Aires': 'AR',
  'America/Bogota': 'CO',
  'America/Chicago': 'US',
  'America/Denver': 'US',
  'America/Edmonton': 'CA',
  'America/Halifax': 'CA',
  'America/Los_Angeles': 'US',
  'America/Mexico_City': 'MX',
  'America/New_York': 'US',
  'America/Phoenix': 'US',
  'America/Sao_Paulo': 'BR',
  'America/Toronto': 'CA',
  'America/Vancouver': 'CA',
  'Asia/Bangkok': 'TH',
  'Asia/Calcutta': 'IN',
  'Asia/Colombo': 'LK',
  'Asia/Dhaka': 'BD',
  'Asia/Dubai': 'AE',
  'Asia/Hong_Kong': 'HK',
  'Asia/Karachi': 'PK',
  'Asia/Kathmandu': 'NP',
  'Asia/Kolkata': 'IN',
  'Asia/Kuala_Lumpur': 'MY',
  'Asia/Manila': 'PH',
  'Asia/Qatar': 'QA',
  'Asia/Riyadh': 'SA',
  'Asia/Singapore': 'SG',
  'Asia/Tel_Aviv': 'IL',
  'Asia/Jerusalem': 'IL',
  'Australia/Adelaide': 'AU',
  'Australia/Brisbane': 'AU',
  'Australia/Melbourne': 'AU',
  'Australia/Perth': 'AU',
  'Australia/Sydney': 'AU',
  'Europe/Amsterdam': 'NL',
  'Europe/Athens': 'GR',
  'Europe/Berlin': 'DE',
  'Europe/Brussels': 'BE',
  'Europe/Bucharest': 'RO',
  'Europe/Budapest': 'HU',
  'Europe/Copenhagen': 'DK',
  'Europe/Dublin': 'IE',
  'Europe/Helsinki': 'FI',
  'Europe/Istanbul': 'TR',
  'Europe/Lisbon': 'PT',
  'Europe/London': 'GB',
  'Europe/Madrid': 'ES',
  'Europe/Oslo': 'NO',
  'Europe/Paris': 'FR',
  'Europe/Prague': 'CZ',
  'Europe/Rome': 'IT',
  'Europe/Stockholm': 'SE',
  'Europe/Vienna': 'AT',
  'Europe/Warsaw': 'PL',
  'Europe/Zurich': 'CH',
  'Pacific/Auckland': 'NZ',
  'Pacific/Honolulu': 'US'
}

const ipCache = new Map<string, { country: string, until: number }>()
const IP_CACHE_MS = 24 * 60 * 60 * 1000
let ratesCache: { rates: Record<string, number>, until: number } | null = null

function isPrivateIp (ip: string) {
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('127.') ||
    ip.startsWith('0.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip) ||
    ip.startsWith('fc') ||
    ip.startsWith('fd') ||
    ip.startsWith('fe80')
  )
}

export function getClientIp (headers: Headers) {
  const forwarded = headers.get('x-forwarded-for') || headers.get('x-real-ip') || headers.get('cf-connecting-ip') || ''
  const ip = forwarded.split(',')[0]?.trim() || ''
  return ip.replace(/^::ffff:/, '')
}

export function countryFromHeaders (headers: Headers) {
  const raw = (
    headers.get('cf-ipcountry') ||
    headers.get('x-vercel-ip-country') ||
    headers.get('cloudfront-viewer-country') ||
    headers.get('x-country-code') ||
    headers.get('x-appengine-country') ||
    headers.get('fastly-client-country-code') ||
    ''
  ).trim().toUpperCase()
  if (!raw || raw === 'XX' || raw === 'T1' || raw === 'ZZ') return ''
  if (raw.includes(',')) return raw.split(',')[0].trim().slice(0, 2)
  return raw.slice(0, 2)
}

export function countryFromTimezone (timezone?: string | null) {
  if (!timezone) return ''
  if (TIMEZONE_COUNTRY[timezone]) return TIMEZONE_COUNTRY[timezone]
  if (timezone.startsWith('America/')) return 'US'
  if (timezone.startsWith('Europe/')) return 'DE'
  if (timezone.startsWith('Asia/Kolkata') || timezone.startsWith('Asia/Calcutta')) return 'IN'
  if (timezone.startsWith('Australia/')) return 'AU'
  return ''
}

export function countryFromAcceptLanguage (header?: string | null) {
  if (!header) return ''
  const match = header.match(/[-_]([A-Za-z]{2})(?:;|,|$)/)
  return match?.[1]?.toUpperCase() || ''
}

async function lookupCountryFromIp (ip: string) {
  if (!ip || isPrivateIp(ip)) return ''
  const hit = ipCache.get(ip)
  if (hit && hit.until > Date.now()) return hit.country
  try {
    const res = await fetch(
      `https://ipwho.is/${encodeURIComponent(ip)}?fields=country_code,success`,
      { signal: AbortSignal.timeout(1500), cache: 'no-store' }
    )
    if (!res.ok) return ''
    const data = await res.json() as { success?: boolean, country_code?: string }
    const country = data?.success && data.country_code ? data.country_code.toUpperCase() : ''
    if (country) ipCache.set(ip, { country, until: Date.now() + IP_CACHE_MS })
    return country
  } catch {
    return ''
  }
}

async function getUsdRates () {
  if (ratesCache && ratesCache.until > Date.now()) return ratesCache.rates
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      signal: AbortSignal.timeout(2000),
      next: { revalidate: 21600 }
    } as RequestInit)
    if (!res.ok) return null
    const data = await res.json() as { result?: string, rates?: Record<string, number> }
    if (data?.result !== 'success' || !data.rates) return null
    ratesCache = { rates: data.rates, until: Date.now() + 6 * 60 * 60 * 1000 }
    return data.rates
  } catch {
    return null
  }
}

export function currencyForCountry (countryCode: string) {
  const mapped = COUNTRY_CURRENCY[countryCode.toUpperCase()] || 'USD'
  return CHARGE_CURRENCIES.has(mapped) ? mapped : 'USD'
}

export function countryName (countryCode: string) {
  if (!countryCode) return ''
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(countryCode) || countryCode
  } catch {
    return countryCode
  }
}

export function getBookPriceMinor (outputType: 'DIGI_BOOK' | 'LULU_BOOK', currency: string) {
  const row = CURATED[currency.toUpperCase()]
  if (!row) return outputType === 'LULU_BOOK' ? USD_HARDCOVER_MINOR : USD_DIGITAL_MINOR
  return outputType === 'LULU_BOOK' ? row.hardcover : row.digital
}

function buildQuote (opts: {
  countryCode: string
  currencyCode: string
  usdToLocal: number
  digitalMinor: number
  hardcoverMinor: number
  locale: string
  isLocalized: boolean
}): LocalizedQuote {
  const exponent = 2
  const symbol = getCurrencySymbol(opts.currencyCode, opts.locale)
  return {
    countryCode: opts.countryCode,
    countryName: countryName(opts.countryCode),
    currencyCode: opts.currencyCode,
    currencySymbol: symbol,
    locale: opts.locale,
    exponent,
    digitalMinor: opts.digitalMinor,
    hardcoverMinor: opts.hardcoverMinor,
    digitalPrice: formatMinor(opts.digitalMinor, opts.currencyCode, opts.locale, exponent),
    hardcoverPrice: formatMinor(opts.hardcoverMinor, opts.currencyCode, opts.locale, exponent),
    usdToLocal: opts.usdToLocal,
    isLocalized: opts.isLocalized
  }
}

export async function detectCountry (opts: {
  headers: Headers
  countryOverride?: string | null
  timezone?: string | null
}) {
  const override = opts.countryOverride?.trim().toUpperCase()
  if (override && override.length === 2) return override

  const fromHeader = countryFromHeaders(opts.headers)
  if (fromHeader) return fromHeader

  const ip = getClientIp(opts.headers)
  const fromIp = await lookupCountryFromIp(ip)
  if (fromIp) return fromIp

  const fromTz = countryFromTimezone(opts.timezone)
  if (fromTz) return fromTz

  const fromLang = countryFromAcceptLanguage(opts.headers.get('accept-language'))
  if (fromLang && COUNTRY_CURRENCY[fromLang]) return fromLang

  return 'US'
}

export async function resolveLocalizedPricing (opts: {
  headers: Headers
  countryOverride?: string | null
  currencyOverride?: string | null
  timezone?: string | null
}): Promise<LocalizedQuote> {
  const currencyOverride = opts.currencyOverride?.trim().toUpperCase()
  const countryCode = await detectCountry(opts)
  const detectedCurrency = currencyForCountry(countryCode)
  const currencyCode = currencyOverride && CHARGE_CURRENCIES.has(currencyOverride)
    ? currencyOverride
    : detectedCurrency

  const rates = await getUsdRates()
  const curated = CURATED[currencyCode] || CURATED.USD
  const usdToLocal = rates?.[currencyCode] || curated.usdToLocal

  return buildQuote({
    countryCode,
    currencyCode,
    usdToLocal,
    digitalMinor: curated.digital,
    hardcoverMinor: curated.hardcover,
    locale: curated.locale,
    isLocalized: true
  })
}

export function quoteToApiPayload (quote: LocalizedQuote) {
  return {
    countryCode: quote.countryCode,
    countryName: quote.countryName,
    currencyCode: quote.currencyCode,
    currencySymbol: quote.currencySymbol,
    locale: quote.locale,
    exponent: quote.exponent,
    usdToLocal: quote.usdToLocal,
    digital: { price: quote.digitalPrice, priceRaw: quote.digitalMinor },
    hardcover: { price: quote.hardcoverPrice, priceRaw: quote.hardcoverMinor },
    isLocalized: quote.isLocalized,
    provider: 'razorpay',
    taxNote: 'Tax calculated at checkout'
  }
}

export type LocalizedPricesPayload = ReturnType<typeof quoteToApiPayload>
