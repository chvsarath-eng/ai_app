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
        background: 'rgba(255, 255, 255, 0.98)',
        backdropFilter: 'blur(12px)',
        padding: '16px 24px',
        alignItems: 'center',
        fontSize: '14px',
        color: '#3f3f46',
        boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.08)',
        borderTop: '1px solid rgba(139, 92, 246, 0.1)'
      }}
      buttonStyle={{
        background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
        color: 'white',
        fontSize: '14px',
        fontWeight: '600',
        padding: '10px 24px',
        borderRadius: '10px',
        border: 'none',
        cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(124, 58, 237, 0.3)'
      }}
      declineButtonStyle={{
        background: 'transparent',
        color: '#71717a',
        fontSize: '14px',
        fontWeight: '500',
        padding: '10px 24px',
        borderRadius: '10px',
        border: '1px solid #e4e4e7',
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
        style={{ color: '#7c3aed', textDecoration: 'underline' }}
      >
        Learn more
      </a>
    </CookieConsent>
  )
}
