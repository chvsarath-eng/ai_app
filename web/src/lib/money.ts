export function formatMinor (minor: number, currencyCode: string, locale = 'en-US', exponent = 2) {
  const major = minor / (10 ** exponent)
  const fraction = minor % (10 ** exponent) === 0 ? 0 : exponent
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: fraction,
    maximumFractionDigits: fraction
  }).format(major)
}

export function getCurrencySymbol (currencyCode: string, locale = 'en-US') {
  const parts = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode
  }).formatToParts(0)
  return parts.find((part) => part.type === 'currency')?.value || currencyCode
}

export function usdMajorToMinor (usdMajor: number, quote: { usdToLocal: number, exponent: number }) {
  if (!Number.isFinite(usdMajor) || usdMajor <= 0) return 0
  return Math.round(usdMajor * quote.usdToLocal * (10 ** quote.exponent))
}
