import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Read img2x Terms of Service. Learn about our refund policy, user responsibilities, intellectual property rights, and service terms.',
  openGraph: {
    title: 'Terms of Service | img2x',
    description: 'Read the terms and conditions for using img2x services.',
    url: 'https://img2x.com/terms',
  },
}

export default function TermsPage () {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-16 pt-12 sm:px-6 lg:px-10">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
        Terms of Service
      </h1>
      <p className="mt-3 text-sm text-zinc-600">
        Last Updated: January 24, 2026
      </p>

      <section className="mt-8 space-y-4 text-sm text-zinc-700 leading-relaxed">
        <p>
          Welcome to img2x. These Terms of Service ("Terms") govern your access to and use of the img2x website, 
          mobile applications, and AI-powered personalized storybook service (collectively, the "Service"). 
          By accessing or using the Service, you agree to be bound by these Terms.
        </p>
        <p className="font-semibold">
          IF YOU DO NOT AGREE TO THESE TERMS, DO NOT USE THE SERVICE.
        </p>
        <p>
          For questions about these Terms, contact us at{' '}
          <a className="text-violet-600 hover:text-violet-700 underline" href="mailto:team@img2x.com">team@img2x.com</a>.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-2xl font-bold text-zinc-900">1. Acceptance of Terms</h2>
        <p className="text-sm text-zinc-700">
          By creating an account, placing an order, or otherwise using the Service, you represent that:
        </p>
        <ul className="space-y-2 text-sm text-zinc-700 list-disc pl-6">
          <li>You are at least 18 years of age</li>
          <li>You have the legal capacity to enter into a binding agreement</li>
          <li>You will comply with these Terms and all applicable laws</li>
          <li>All information you provide is accurate, current, and complete</li>
        </ul>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-2xl font-bold text-zinc-900">2. Description of Service</h2>
        <p className="text-sm text-zinc-700">
          img2x provides an AI-powered platform that creates personalized storybooks based on photos and text you provide. 
          The Service includes:
        </p>
        <ul className="space-y-2 text-sm text-zinc-700 list-disc pl-6">
          <li><strong>Digital Books:</strong> Interactive HTML storybooks delivered via email or download</li>
          <li><strong>Premium Hardcover Books:</strong> Professionally printed 8.5" × 8.5" hardcover books with premium color printing, 
          matte finish, and 80# white coated paper, shipped to your address</li>
          <li><strong>AI Content Generation:</strong> Automated creation of illustrations and narratives using artificial intelligence</li>
        </ul>
        <p className="text-sm text-zinc-700 mt-4">
          Results may vary based on the quality and content of your inputs. We do not guarantee specific outcomes or that 
          generated content will meet your expectations.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-2xl font-bold text-zinc-900">3. Account Registration and Security</h2>
        <h3 className="text-lg font-semibold text-zinc-900 mt-6">3.1 Account Creation</h3>
        <ul className="space-y-2 text-sm text-zinc-700 list-disc pl-6">
          <li>You must provide accurate and complete information when creating an account</li>
          <li>You are responsible for maintaining the confidentiality of your account credentials</li>
          <li>You must notify us immediately of any unauthorized access to your account</li>
          <li>You are responsible for all activities that occur under your account</li>
        </ul>

        <h3 className="text-lg font-semibold text-zinc-900 mt-6">3.2 Account Termination</h3>
        <p className="text-sm text-zinc-700">
          We reserve the right to suspend or terminate your account at any time for violation of these Terms, 
          fraudulent activity, or any other reason we deem appropriate. You may close your account at any time 
          by contacting us.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-2xl font-bold text-zinc-900">4. User Content and Responsibilities</h2>
        <h3 className="text-lg font-semibold text-zinc-900 mt-6">4.1 Content You Provide</h3>
        <p className="text-sm text-zinc-700">You are solely responsible for all content you upload, including photos, text, and personalization details. You represent and warrant that:</p>
        <ul className="space-y-2 text-sm text-zinc-700 list-disc pl-6">
          <li>You own or have all necessary rights, licenses, and permissions to use and authorize us to use the content</li>
          <li>Your content does not infringe any intellectual property rights, privacy rights, or other rights of any third party</li>
          <li>Your content does not violate any applicable laws or regulations</li>
          <li>Your content does not contain viruses, malware, or other harmful code</li>
        </ul>

        <h3 className="text-lg font-semibold text-zinc-900 mt-6">4.2 Prohibited Content</h3>
        <p className="text-sm text-zinc-700">You agree NOT to upload or submit content that:</p>
        <ul className="space-y-2 text-sm text-zinc-700 list-disc pl-6">
          <li>Is illegal, harmful, threatening, abusive, harassing, defamatory, vulgar, obscene, or otherwise objectionable</li>
          <li>Contains nudity, sexually explicit material, or content exploiting minors</li>
          <li>Promotes violence, discrimination, hatred, or harm against individuals or groups</li>
          <li>Infringes copyrights, trademarks, patents, trade secrets, or other intellectual property rights</li>
          <li>Violates privacy rights or contains personal information of others without consent</li>
          <li>Contains false, misleading, or fraudulent information</li>
          <li>Impersonates any person or entity</li>
        </ul>

        <h3 className="text-lg font-semibold text-zinc-900 mt-6">4.3 Content Moderation</h3>
        <p className="text-sm text-zinc-700">
          We reserve the right (but have no obligation) to review, monitor, or remove any content at our sole discretion. 
          We may refuse to process orders containing prohibited content and may report illegal content to authorities.
        </p>

        <h3 className="text-lg font-semibold text-zinc-900 mt-6">4.4 License to Your Content</h3>
        <p className="text-sm text-zinc-700">
          By uploading content, you grant us a limited, non-exclusive, worldwide, royalty-free license to use, reproduce, 
          process, and display your content solely for the purpose of providing the Service and fulfilling your order. 
          This license terminates when your content is deleted from our systems according to our data retention policies.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-2xl font-bold text-zinc-900">5. Intellectual Property Rights</h2>
        <h3 className="text-lg font-semibold text-zinc-900 mt-6">5.1 Your Rights to Generated Content</h3>
        <p className="text-sm text-zinc-700">
          Upon full payment, you receive a personal, non-exclusive, non-transferable license to use the generated storybook for:
        </p>
        <ul className="space-y-2 text-sm text-zinc-700 list-disc pl-6">
          <li>Personal, non-commercial use</li>
          <li>Sharing with family and friends</li>
          <li>Printing additional copies for personal use</li>
        </ul>
        <p className="text-sm text-zinc-700 mt-4">
          You may NOT use the generated content for commercial purposes, resale, mass distribution, or public display without our prior written consent.
        </p>

        <h3 className="text-lg font-semibold text-zinc-900 mt-6">5.2 Our Rights</h3>
        <p className="text-sm text-zinc-700">
          We retain all rights, title, and interest in:
        </p>
        <ul className="space-y-2 text-sm text-zinc-700 list-disc pl-6">
          <li>The img2x platform, website, software, and technology</li>
          <li>Our trademarks, logos, and branding</li>
          <li>The AI models, algorithms, and processes used to generate content</li>
          <li>Any improvements or modifications we make to the Service</li>
        </ul>

        <h3 className="text-lg font-semibold text-zinc-900 mt-6">5.3 Promotional Use</h3>
        <p className="text-sm text-zinc-700">
          With your explicit consent (provided separately), we may use anonymized or de-identified examples of generated 
          content for marketing, promotional, or demonstration purposes. We will never use identifiable photos of children 
          without parental consent.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-2xl font-bold text-zinc-900">6. Orders, Payment, and Pricing</h2>
        <h3 className="text-lg font-semibold text-zinc-900 mt-6">6.1 Placing Orders</h3>
        <ul className="space-y-2 text-sm text-zinc-700 list-disc pl-6">
          <li>All orders are subject to acceptance by us</li>
          <li>We reserve the right to refuse or cancel any order for any reason</li>
          <li>Prices are displayed in USD and are subject to change without notice</li>
          <li>You are responsible for providing accurate shipping information for physical books</li>
        </ul>

        <h3 className="text-lg font-semibold text-zinc-900 mt-6">6.2 Payment</h3>
        <ul className="space-y-2 text-sm text-zinc-700 list-disc pl-6">
          <li>Payment is required in full before order processing begins</li>
          <li>We accept major credit cards and other payment methods as displayed</li>
          <li>Payment processing is handled by secure third-party providers</li>
          <li>You authorize us to charge your payment method for all fees incurred</li>
          <li>All sales are final once production begins (see Refund Policy below)</li>
        </ul>

        <h3 className="text-lg font-semibold text-zinc-900 mt-6">6.3 Taxes</h3>
        <p className="text-sm text-zinc-700">
          Prices do not include applicable sales tax, VAT, or other taxes. You are responsible for all taxes 
          associated with your purchase. We will collect and remit taxes as required by law.
        </p>

        <h3 className="text-lg font-semibold text-zinc-900 mt-6">6.4 Promotional Offers</h3>
        <p className="text-sm text-zinc-700">
          Promotional pricing, discounts, and special offers are subject to terms and conditions specified at the time 
          of the promotion. Offers may be limited in time, quantity, or eligibility and cannot be combined unless stated otherwise.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-2xl font-bold text-zinc-900">7. Delivery and Shipping</h2>
        <h3 className="text-lg font-semibold text-zinc-900 mt-6">7.1 Digital Books</h3>
        <ul className="space-y-2 text-sm text-zinc-700 list-disc pl-6">
          <li>Delivered via email or download link within 24-48 hours of order completion</li>
          <li>You are responsible for providing a valid email address</li>
          <li>Check your spam/junk folder if you don't receive your book</li>
          <li>Contact us within 7 days if you don't receive your digital book</li>
        </ul>

        <h3 className="text-lg font-semibold text-zinc-900 mt-6">7.2 Physical Books</h3>
        <ul className="space-y-2 text-sm text-zinc-700 list-disc pl-6">
          <li>Production typically takes 3-5 business days</li>
          <li>Shipping times vary by location (typically 5-10 business days for domestic, 10-20 for international)</li>
          <li>You are responsible for providing accurate shipping information</li>
          <li>We are not responsible for delays caused by shipping carriers, customs, or incorrect addresses</li>
          <li>Risk of loss transfers to you upon delivery to the carrier</li>
        </ul>

        <h3 className="text-lg font-semibold text-zinc-900 mt-6">7.3 Shipping Costs</h3>
        <p className="text-sm text-zinc-700">
          Shipping costs are calculated at checkout based on destination and shipping method. International orders may 
          be subject to customs duties, taxes, and fees, which are your responsibility.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-2xl font-bold text-zinc-900">8. Refunds and Cancellations</h2>
        <h3 className="text-lg font-semibold text-zinc-900 mt-6">8.1 Digital Products</h3>
        <p className="text-sm text-zinc-700">
          Due to the personalized and digital nature of our products, <strong>digital book purchases are generally non-refundable</strong> 
          once the book has been generated and delivered. However, we will provide a refund or replacement if:
        </p>
        <ul className="space-y-2 text-sm text-zinc-700 list-disc pl-6">
          <li>There is a technical error preventing you from accessing your book</li>
          <li>The book was not generated due to a system failure</li>
          <li>The content significantly deviates from what was promised due to our error</li>
        </ul>

        <h3 className="text-lg font-semibold text-zinc-900 mt-6">8.2 Physical Products</h3>
        <p className="text-sm text-zinc-700">
          Because physical books are custom-printed, <strong>orders cannot be cancelled once production begins</strong> 
          (typically within 24 hours of order placement). We will provide a refund, replacement, or reprint if:
        </p>
        <ul className="space-y-2 text-sm text-zinc-700 list-disc pl-6">
          <li>The book arrives damaged or defective due to printing or shipping issues</li>
          <li>The book contains significant printing errors (incorrect colors, missing pages, etc.)</li>
          <li>You received the wrong product</li>
        </ul>
        <p className="text-sm text-zinc-700 mt-4">
          You must report issues within 14 days of delivery with photographic evidence. We are not responsible for 
          damage caused after delivery or dissatisfaction with AI-generated content that accurately reflects your inputs.
        </p>

        <h3 className="text-lg font-semibold text-zinc-900 mt-6">8.3 Refund Process</h3>
        <p className="text-sm text-zinc-700">
          To request a refund, contact us at{' '}
          <a className="text-violet-600 hover:text-violet-700 underline" href="mailto:team@img2x.com">team@img2x.com</a>{' '}
          with your order number and reason for the request. Approved refunds will be processed within 5-10 business days 
          to your original payment method.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-2xl font-bold text-zinc-900">9. Disclaimers and Warranties</h2>
        <h3 className="text-lg font-semibold text-zinc-900 mt-6">9.1 "As Is" Service</h3>
        <p className="text-sm text-zinc-700">
          THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, 
          INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, 
          OR COURSE OF PERFORMANCE.
        </p>

        <h3 className="text-lg font-semibold text-zinc-900 mt-6">9.2 No Guarantee of Results</h3>
        <p className="text-sm text-zinc-700">
          We do not guarantee that:
        </p>
        <ul className="space-y-2 text-sm text-zinc-700 list-disc pl-6">
          <li>The Service will meet your specific requirements or expectations</li>
          <li>AI-generated content will be error-free, accurate, or of a particular quality</li>
          <li>The Service will be uninterrupted, secure, or free from bugs or viruses</li>
          <li>Any defects will be corrected</li>
        </ul>

        <h3 className="text-lg font-semibold text-zinc-900 mt-6">9.3 AI Limitations</h3>
        <p className="text-sm text-zinc-700">
          AI-generated content is created by automated systems and may contain inaccuracies, inconsistencies, or unexpected results. 
          You are responsible for reviewing generated content before use. We are not liable for content that does not meet your 
          expectations if it was generated based on your inputs.
        </p>

        <h3 className="text-lg font-semibold text-zinc-900 mt-6">9.4 Third-Party Services</h3>
        <p className="text-sm text-zinc-700">
          The Service may integrate with or rely on third-party services (payment processors, shipping carriers, cloud providers). 
          We are not responsible for the availability, accuracy, or performance of third-party services.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-2xl font-bold text-zinc-900">10. Limitation of Liability</h2>
        <p className="text-sm text-zinc-700">
          TO THE MAXIMUM EXTENT PERMITTED BY LAW:
        </p>
        <ul className="space-y-2 text-sm text-zinc-700 list-disc pl-6">
          <li>IMG2X AND ITS AFFILIATES, OFFICERS, EMPLOYEES, AGENTS, AND LICENSORS SHALL NOT BE LIABLE FOR ANY INDIRECT, 
          INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES, INCLUDING BUT NOT LIMITED TO DAMAGES FOR 
          LOSS OF PROFITS, GOODWILL, USE, DATA, OR OTHER INTANGIBLE LOSSES</li>
          <li>OUR TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF OR RELATING TO THESE TERMS OR THE SERVICE SHALL NOT EXCEED 
          THE AMOUNT YOU PAID US IN THE 12 MONTHS PRECEDING THE CLAIM, OR $100, WHICHEVER IS GREATER</li>
          <li>THESE LIMITATIONS APPLY REGARDLESS OF THE LEGAL THEORY (CONTRACT, TORT, NEGLIGENCE, STRICT LIABILITY, OR OTHERWISE) 
          AND EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES</li>
        </ul>
        <p className="text-sm text-zinc-700 mt-4">
          Some jurisdictions do not allow the exclusion or limitation of certain damages, so some of the above limitations 
          may not apply to you.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-2xl font-bold text-zinc-900">11. Indemnification</h2>
        <p className="text-sm text-zinc-700">
          You agree to indemnify, defend, and hold harmless img2x and its affiliates, officers, directors, employees, agents, 
          and licensors from and against any claims, liabilities, damages, losses, costs, or expenses (including reasonable 
          attorneys' fees) arising out of or relating to:
        </p>
        <ul className="space-y-2 text-sm text-zinc-700 list-disc pl-6">
          <li>Your use of the Service</li>
          <li>Your violation of these Terms</li>
          <li>Your violation of any rights of another party</li>
          <li>Content you upload or submit</li>
          <li>Any misrepresentation you make</li>
        </ul>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-2xl font-bold text-zinc-900">12. Dispute Resolution</h2>
        <h3 className="text-lg font-semibold text-zinc-900 mt-6">12.1 Informal Resolution</h3>
        <p className="text-sm text-zinc-700">
          Before filing a claim, you agree to contact us at{' '}
          <a className="text-violet-600 hover:text-violet-700 underline" href="mailto:team@img2x.com">team@img2x.com</a>{' '}
          and attempt to resolve the dispute informally. We will attempt to resolve disputes within 30 days.
        </p>

        <h3 className="text-lg font-semibold text-zinc-900 mt-6">12.2 Arbitration Agreement</h3>
        <p className="text-sm text-zinc-700">
          If we cannot resolve a dispute informally, you agree that any dispute arising out of or relating to these Terms 
          or the Service will be resolved through binding arbitration rather than in court, except that:
        </p>
        <ul className="space-y-2 text-sm text-zinc-700 list-disc pl-6">
          <li>You may assert claims in small claims court if they qualify</li>
          <li>Either party may seek injunctive or equitable relief in court for intellectual property infringement</li>
        </ul>
        <p className="text-sm text-zinc-700 mt-4">
          Arbitration will be conducted by a neutral arbitrator in accordance with the American Arbitration Association (AAA) 
          rules. The arbitrator's decision will be final and binding. YOU AND IMG2X AGREE THAT EACH MAY BRING CLAIMS AGAINST 
          THE OTHER ONLY IN YOUR OR ITS INDIVIDUAL CAPACITY AND NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY CLASS OR REPRESENTATIVE ACTION.
        </p>

        <h3 className="text-lg font-semibold text-zinc-900 mt-6">12.3 Governing Law</h3>
        <p className="text-sm text-zinc-700">
          These Terms are governed by the laws of [Your State/Country], without regard to conflict of law principles. 
          Any arbitration or court proceeding will take place in [Your Location].
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-2xl font-bold text-zinc-900">13. General Provisions</h2>
        <h3 className="text-lg font-semibold text-zinc-900 mt-6">13.1 Entire Agreement</h3>
        <p className="text-sm text-zinc-700">
          These Terms, together with our Privacy Policy, constitute the entire agreement between you and img2x regarding 
          the Service and supersede all prior agreements.
        </p>

        <h3 className="text-lg font-semibold text-zinc-900 mt-6">13.2 Modifications</h3>
        <p className="text-sm text-zinc-700">
          We may modify these Terms at any time by posting updated Terms on our website. Material changes will be notified 
          via email or prominent notice. Your continued use of the Service after changes become effective constitutes acceptance 
          of the modified Terms.
        </p>

        <h3 className="text-lg font-semibold text-zinc-900 mt-6">13.3 Severability</h3>
        <p className="text-sm text-zinc-700">
          If any provision of these Terms is found to be invalid or unenforceable, the remaining provisions will remain in 
          full force and effect.
        </p>

        <h3 className="text-lg font-semibold text-zinc-900 mt-6">13.4 Waiver</h3>
        <p className="text-sm text-zinc-700">
          Our failure to enforce any right or provision of these Terms will not be deemed a waiver of such right or provision.
        </p>

        <h3 className="text-lg font-semibold text-zinc-900 mt-6">13.5 Assignment</h3>
        <p className="text-sm text-zinc-700">
          You may not assign or transfer these Terms or your rights under them without our prior written consent. We may 
          assign these Terms without restriction.
        </p>

        <h3 className="text-lg font-semibold text-zinc-900 mt-6">13.6 Force Majeure</h3>
        <p className="text-sm text-zinc-700">
          We are not liable for delays or failures in performance resulting from causes beyond our reasonable control, 
          including but not limited to acts of God, natural disasters, war, terrorism, riots, embargoes, acts of civil or 
          military authorities, fire, floods, accidents, pandemics, strikes, or shortages of transportation, facilities, 
          fuel, energy, labor, or materials.
          </p>
        </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-2xl font-bold text-zinc-900">14. Contact Information</h2>
        <p className="text-sm text-zinc-700">
          For questions, concerns, or notices regarding these Terms, please contact us:
        </p>
        <div className="mt-4 p-4 bg-zinc-50 rounded-lg text-sm text-zinc-700">
          <p className="font-semibold">img2x</p>
          <p>Email: <a className="text-violet-600 hover:text-violet-700 underline" href="mailto:team@img2x.com">team@img2x.com</a></p>
      </div>
      </section>

      <section className="mt-10 p-6 bg-violet-50 rounded-lg">
        <p className="text-sm text-zinc-700">
          <strong>Legal Notice:</strong> These Terms of Service are provided as a template and should be reviewed by a 
          qualified attorney to ensure compliance with all applicable laws in your jurisdiction. Laws vary by location and 
          are subject to change. You should customize sections such as governing law, dispute resolution, and specific 
          product details to match your business needs.
        </p>
      </section>
    </main>
  )
}

