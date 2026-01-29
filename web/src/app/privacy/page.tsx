import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Learn how img2x collects, uses, and protects your personal information. GDPR, CCPA, and COPPA compliant. Photos deleted within 30 days.',
  openGraph: {
    title: 'Privacy Policy | img2x',
    description: 'Learn how img2x protects your privacy and handles your data.',
    url: 'https://img2x.com/privacy',
  },
}

export default function PrivacyPage () {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-16 pt-12 sm:px-6 lg:px-10">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
        Privacy Policy
      </h1>
      <p className="mt-3 text-sm text-zinc-600">
        Last Updated: January 24, 2026
      </p>

      <section className="mt-8 space-y-4 text-sm text-zinc-700 leading-relaxed">
        <p>
          img2x ("we," "us," or "our") respects your privacy and is committed to protecting your personal information. 
          This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our 
          AI-powered personalized storybook service (the "Service").
        </p>
        <p>
          By using the Service, you agree to the collection and use of information in accordance with this policy. 
          If you do not agree with our policies and practices, do not use the Service.
        </p>
        <p className="font-semibold">
          Contact us: <a className="text-violet-600 hover:text-violet-700 underline" href="mailto:team@img2x.com">team@img2x.com</a>
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-2xl font-bold text-zinc-900">1. Information We Collect</h2>
        
        <h3 className="text-lg font-semibold text-zinc-900 mt-6">1.1 Personal Information You Provide</h3>
        <ul className="space-y-2 text-sm text-zinc-700 list-disc pl-6">
          <li><strong>Account Information:</strong> Name, email address, and password when you create an account</li>
          <li><strong>Content Data:</strong> Photos, images, child's name, age, storyline prompts, and any other personalization details you provide</li>
          <li><strong>Payment Information:</strong> Billing address and payment details (processed securely through third-party payment processors; we do not store full credit card numbers)</li>
          <li><strong>Communication Data:</strong> Messages, feedback, and support requests you send to us</li>
          <li><strong>Shipping Information:</strong> Delivery address for physical book orders</li>
        </ul>

        <h3 className="text-lg font-semibold text-zinc-900 mt-6">1.2 Information Automatically Collected</h3>
        <ul className="space-y-2 text-sm text-zinc-700 list-disc pl-6">
          <li><strong>Usage Data:</strong> Pages viewed, features used, time spent, click patterns, and interaction data</li>
          <li><strong>Device Information:</strong> IP address, browser type, operating system, device identifiers, and mobile network information</li>
          <li><strong>Cookies and Tracking:</strong> We use cookies, web beacons, and similar technologies to enhance user experience and analyze usage patterns</li>
        </ul>

        <h3 className="text-lg font-semibold text-zinc-900 mt-6">1.3 AI-Generated Content</h3>
        <p className="text-sm text-zinc-700">
          Our Service uses artificial intelligence to generate personalized storybook content based on your inputs. 
          The AI processes your photos and text to create unique illustrations and narratives.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-2xl font-bold text-zinc-900">2. How We Use Your Information</h2>
        <p className="text-sm text-zinc-700">We use collected information for the following purposes:</p>
        <ul className="space-y-2 text-sm text-zinc-700 list-disc pl-6">
          <li><strong>Service Delivery:</strong> To create, process, and deliver your personalized storybooks</li>
          <li><strong>Account Management:</strong> To create and manage your account, authenticate users, and provide customer support</li>
          <li><strong>Payment Processing:</strong> To process transactions and send receipts</li>
          <li><strong>Communication:</strong> To send order confirmations, delivery updates, and respond to inquiries</li>
          <li><strong>Service Improvement:</strong> To analyze usage patterns, improve AI algorithms, enhance features, and optimize user experience</li>
          <li><strong>Security:</strong> To detect, prevent, and address fraud, abuse, security issues, and technical problems</li>
          <li><strong>Legal Compliance:</strong> To comply with legal obligations and enforce our Terms of Service</li>
          <li><strong>Marketing:</strong> With your consent, to send promotional communications about new features, products, and special offers (you can opt out anytime)</li>
        </ul>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-2xl font-bold text-zinc-900">3. Legal Basis for Processing (GDPR)</h2>
        <p className="text-sm text-zinc-700">If you are in the European Economic Area (EEA), we process your personal data based on:</p>
        <ul className="space-y-2 text-sm text-zinc-700 list-disc pl-6">
          <li><strong>Contractual Necessity:</strong> Processing necessary to fulfill our contract with you (creating and delivering your storybook)</li>
          <li><strong>Consent:</strong> You have given explicit consent for specific processing activities (e.g., marketing emails)</li>
          <li><strong>Legitimate Interests:</strong> Processing necessary for our legitimate business interests (e.g., fraud prevention, service improvement) that do not override your rights</li>
          <li><strong>Legal Obligation:</strong> Processing required to comply with legal requirements</li>
        </ul>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-2xl font-bold text-zinc-900">4. Data Retention</h2>
        <p className="text-sm text-zinc-700">We retain your information only as long as necessary for the purposes outlined in this policy:</p>
        <ul className="space-y-2 text-sm text-zinc-700 list-disc pl-6">
          <li><strong>Uploaded Photos:</strong> Deleted within 30 days after your storybook is generated, unless you request earlier deletion</li>
          <li><strong>Generated Storybooks:</strong> Retained for 12 months to allow re-downloads and reprints</li>
          <li><strong>Account Information:</strong> Retained until you request account deletion</li>
          <li><strong>Transaction Records:</strong> Retained for 7 years for tax and accounting purposes as required by law</li>
          <li><strong>Usage Analytics:</strong> Aggregated and anonymized data may be retained indefinitely for statistical purposes</li>
        </ul>
        <p className="text-sm text-zinc-700 mt-4">
          You can request deletion of your data at any time by contacting us at{' '}
          <a className="text-violet-600 hover:text-violet-700 underline" href="mailto:team@img2x.com">team@img2x.com</a>.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-2xl font-bold text-zinc-900">5. How We Share Your Information</h2>
        <p className="text-sm text-zinc-700">We do not sell your personal information. We may share your information with:</p>
        <ul className="space-y-2 text-sm text-zinc-700 list-disc pl-6">
          <li><strong>Service Providers:</strong> Third-party vendors who perform services on our behalf (payment processing, cloud hosting, email delivery, printing services). These providers are contractually obligated to protect your data.</li>
          <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets, your information may be transferred to the acquiring entity</li>
          <li><strong>Legal Requirements:</strong> When required by law, court order, or government request, or to protect our rights, property, or safety</li>
          <li><strong>With Your Consent:</strong> We may share information for other purposes with your explicit consent</li>
        </ul>
        <p className="text-sm text-zinc-700 mt-4 font-semibold">
          We never sell, rent, or trade your personal information to third parties for their marketing purposes.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-2xl font-bold text-zinc-900">6. Your Privacy Rights</h2>
        
        <h3 className="text-lg font-semibold text-zinc-900 mt-6">6.1 General Rights</h3>
        <ul className="space-y-2 text-sm text-zinc-700 list-disc pl-6">
          <li><strong>Access:</strong> Request a copy of the personal information we hold about you</li>
          <li><strong>Correction:</strong> Request correction of inaccurate or incomplete information</li>
          <li><strong>Deletion:</strong> Request deletion of your personal information (subject to legal retention requirements)</li>
          <li><strong>Opt-Out:</strong> Unsubscribe from marketing emails using the link in any promotional email</li>
          <li><strong>Data Portability:</strong> Request a copy of your data in a structured, machine-readable format</li>
        </ul>

        <h3 className="text-lg font-semibold text-zinc-900 mt-6">6.2 GDPR Rights (EEA Residents)</h3>
        <p className="text-sm text-zinc-700">If you are in the EEA, you have additional rights:</p>
        <ul className="space-y-2 text-sm text-zinc-700 list-disc pl-6">
          <li>Right to withdraw consent at any time</li>
          <li>Right to restrict processing of your data</li>
          <li>Right to object to processing based on legitimate interests</li>
          <li>Right to lodge a complaint with your local data protection authority</li>
        </ul>

        <h3 className="text-lg font-semibold text-zinc-900 mt-6">6.3 CCPA Rights (California Residents)</h3>
        <p className="text-sm text-zinc-700">California residents have the right to:</p>
        <ul className="space-y-2 text-sm text-zinc-700 list-disc pl-6">
          <li>Know what personal information is collected, used, shared, or sold</li>
          <li>Delete personal information held by us</li>
          <li>Opt-out of the sale of personal information (we do not sell personal information)</li>
          <li>Non-discrimination for exercising CCPA rights</li>
        </ul>

        <h3 className="text-lg font-semibold text-zinc-900 mt-6">6.4 Other U.S. State Privacy Rights</h3>
        <p className="text-sm text-zinc-700">
          Residents of Indiana, Kentucky, Rhode Island, and other states with comprehensive privacy laws have similar rights 
          to access, correct, delete, and port their data. Contact us to exercise these rights.
        </p>

        <p className="text-sm text-zinc-700 mt-6 font-semibold">
          To exercise any of these rights, contact us at{' '}
          <a className="text-violet-600 hover:text-violet-700 underline" href="mailto:team@img2x.com">team@img2x.com</a>. 
          We will respond within 30 days (or as required by applicable law).
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-2xl font-bold text-zinc-900">7. Children's Privacy (COPPA Compliance)</h2>
        <p className="text-sm text-zinc-700">
          Our Service is intended for use by adults creating storybooks for children. We do not knowingly collect personal 
          information directly from children under 13 without parental consent.
        </p>
        <ul className="space-y-2 text-sm text-zinc-700 list-disc pl-6 mt-4">
          <li>Users must be 18 years or older to create an account and place orders</li>
          <li>Parents/guardians provide children's information (name, age, photo) for storybook personalization only</li>
          <li>We do not use children's information for marketing or advertising purposes</li>
          <li>Parents can request deletion of their child's information at any time</li>
          <li>If we learn we have collected information from a child under 13 without parental consent, we will delete it immediately</li>
        </ul>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-2xl font-bold text-zinc-900">8. Data Security</h2>
        <p className="text-sm text-zinc-700">
          We implement industry-standard security measures to protect your information:
        </p>
        <ul className="space-y-2 text-sm text-zinc-700 list-disc pl-6">
          <li>Encryption of data in transit (SSL/TLS) and at rest</li>
          <li>Secure authentication and access controls</li>
          <li>Regular security audits and vulnerability assessments</li>
          <li>Employee training on data protection practices</li>
          <li>Secure data centers with physical and network security</li>
        </ul>
        <p className="text-sm text-zinc-700 mt-4">
          However, no method of transmission or storage is 100% secure. While we strive to protect your information, 
          we cannot guarantee absolute security. You are responsible for maintaining the confidentiality of your account credentials.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-2xl font-bold text-zinc-900">9. International Data Transfers</h2>
        <p className="text-sm text-zinc-700">
          Your information may be transferred to and processed in countries other than your country of residence. 
          These countries may have different data protection laws. When we transfer data internationally, we ensure 
          appropriate safeguards are in place, such as:
        </p>
        <ul className="space-y-2 text-sm text-zinc-700 list-disc pl-6">
          <li>Standard Contractual Clauses approved by the European Commission</li>
          <li>Adequacy decisions recognizing equivalent data protection</li>
          <li>Your explicit consent for the transfer</li>
        </ul>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-2xl font-bold text-zinc-900">10. Cookies and Tracking Technologies</h2>
        <p className="text-sm text-zinc-700">We use cookies and similar technologies to:</p>
        <ul className="space-y-2 text-sm text-zinc-700 list-disc pl-6">
          <li><strong>Essential Cookies:</strong> Required for the Service to function (authentication, security)</li>
          <li><strong>Analytics Cookies:</strong> Help us understand how users interact with the Service</li>
          <li><strong>Preference Cookies:</strong> Remember your settings and preferences</li>
          <li><strong>Marketing Cookies:</strong> Track effectiveness of advertising campaigns (with your consent)</li>
        </ul>
        <p className="text-sm text-zinc-700 mt-4">
          You can control cookies through your browser settings. Note that disabling certain cookies may limit Service functionality.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-2xl font-bold text-zinc-900">11. Third-Party Links</h2>
        <p className="text-sm text-zinc-700">
          Our Service may contain links to third-party websites or services. We are not responsible for the privacy 
          practices of these third parties. We encourage you to review their privacy policies before providing any information.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-2xl font-bold text-zinc-900">12. Changes to This Privacy Policy</h2>
        <p className="text-sm text-zinc-700">
          We may update this Privacy Policy from time to time to reflect changes in our practices, technology, legal requirements, 
          or other factors. We will notify you of material changes by:
        </p>
        <ul className="space-y-2 text-sm text-zinc-700 list-disc pl-6">
          <li>Posting the updated policy on this page with a new "Last Updated" date</li>
          <li>Sending an email notification to your registered email address</li>
          <li>Displaying a prominent notice on our website</li>
        </ul>
        <p className="text-sm text-zinc-700 mt-4">
          Your continued use of the Service after changes become effective constitutes acceptance of the updated policy.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-2xl font-bold text-zinc-900">13. Contact Us</h2>
        <p className="text-sm text-zinc-700">
          If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us:
        </p>
        <div className="mt-4 p-4 bg-zinc-50 rounded-lg text-sm text-zinc-700">
          <p className="font-semibold">img2x</p>
          <p>Email: <a className="text-violet-600 hover:text-violet-700 underline" href="mailto:team@img2x.com">team@img2x.com</a></p>
          <p className="mt-2">For GDPR-related inquiries, please include "GDPR Request" in your subject line.</p>
          <p>For CCPA-related inquiries, please include "CCPA Request" in your subject line.</p>
        </div>
      </section>

      <section className="mt-10 p-6 bg-violet-50 rounded-lg">
        <p className="text-sm text-zinc-700">
          <strong>Note:</strong> This Privacy Policy is provided as a template and should be reviewed by a qualified attorney 
          to ensure compliance with all applicable laws in your jurisdiction. Privacy laws vary by location and are subject to change.
        </p>
      </section>
    </main>
  )
}

