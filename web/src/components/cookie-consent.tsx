'use client'

import CookieConsent from 'react-cookie-consent'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

export function CookieConsentBanner() {
  const handleAccept = () => {
    // Update Google Analytics consent
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('consent', 'update', {
        analytics_storage: 'granted'
      })
    }
  }

  const handleDecline = () => {
    // Keep analytics denied (default state)
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('consent', 'update', {
        analytics_storage: 'denied'
      })
    }
  }

  return (
    <CookieConsent
      location="bottom"
      buttonText="Accept"
      declineButtonText="Decline"
      enableDeclineButton
      onAccept={handleAccept}
      onDecline={handleDecline}
      cookieName="img2x-cookie-consent"
      style={{
        background: 'rgba(30, 30, 30, 0.95)',
        backdropFilter: 'blur(8px)',
        padding: '16px 24px',
        alignItems: 'center',
        fontSize: '14px'
      }}
      buttonStyle={{
        background: '#7c3aed',
        color: 'white',
        fontSize: '14px',
        fontWeight: '600',
        padding: '10px 24px',
        borderRadius: '8px',
        border: 'none',
        cursor: 'pointer'
      }}
      declineButtonStyle={{
        background: 'transparent',
        color: '#a1a1aa',
        fontSize: '14px',
        fontWeight: '500',
        padding: '10px 24px',
        borderRadius: '8px',
        border: '1px solid #3f3f46',
        cursor: 'pointer',
        marginRight: '8px'
      }}
      contentStyle={{
        flex: '1 0 300px',
        margin: '0'
      }}
      expires={365}
    >
      We use cookies to analyze site traffic and improve your experience.{' '}
      <a
        href="/privacy"
        style={{ color: '#a78bfa', textDecoration: 'underline' }}
      >
        Learn more
      </a>
    </CookieConsent>
  )
}
