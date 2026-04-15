import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - MTG Ink",
  description: "Privacy policy for MTG Ink.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white py-12">
      <div className="max-w-3xl mx-auto px-4">
        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: April 15, 2026</p>

        <div className="space-y-8 text-sm text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">1. What We Collect</h2>
            <p>
              <strong className="text-white">Account data.</strong> If you create an account (via Google, Discord, or email/password), we store your email address and display name to identify you across sessions.
            </p>
            <p className="mt-2">
              <strong className="text-white">Votes and activity.</strong> When you vote on card art comparisons, complete brackets, or save favorites, we record those actions. Anonymous users are tracked via a random session ID stored in your browser&rsquo;s localStorage.
            </p>
            <p className="mt-2">
              <strong className="text-white">Decks.</strong> If you import or create decks, the card lists and your art selections are stored in our database.
            </p>
            <p className="mt-2">
              <strong className="text-white">Server logs.</strong> Our hosting provider (Vercel) and CDN (Cloudflare) may collect IP addresses, browser information, and request metadata as part of normal operations.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">2. How We Use It</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>To calculate and display ELO ratings for card art</li>
              <li>To save your favorites, decks, and bracket history</li>
              <li>To run giveaways and contact winners</li>
              <li>To improve the site and fix bugs</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">3. What We Don&rsquo;t Do</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>We don&rsquo;t sell your data to third parties</li>
              <li>We don&rsquo;t run behavioral advertising</li>
              <li>We don&rsquo;t use tracking pixels or third-party analytics</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">4. Cookies and Local Storage</h2>
            <p>
              We use browser localStorage for session IDs, bracket progress, and UI preferences. Supabase Auth uses cookies to manage login sessions. We do not use advertising or third-party tracking cookies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">5. Data Storage</h2>
            <p>
              Your data is stored in a Supabase-hosted PostgreSQL database. Card images are served from Cloudflare R2. The site is hosted on Vercel.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">6. Your Rights</h2>
            <p>
              You can delete your account and associated data at any time from your{" "}
              <a href="/settings" className="text-amber-400 hover:text-amber-300">account settings</a>.
              Your favorites and decks will be permanently deleted; votes and brews will be anonymized.
              You can also email{" "}
              <a href="mailto:hello@mtg.ink" className="text-amber-400 hover:text-amber-300">hello@mtg.ink</a>{" "}
              if you need help. Anonymous votes (those not tied to an account) cannot be individually identified or deleted.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">7. Children</h2>
            <p>
              MTG Ink is not directed at children under 13. We do not knowingly collect personal information from children.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">8. Changes</h2>
            <p>
              We may update this policy from time to time. Changes will be posted on this page with an updated date.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">9. Contact</h2>
            <p>
              Questions? Email us at{" "}
              <a href="mailto:hello@mtg.ink" className="text-amber-400 hover:text-amber-300">hello@mtg.ink</a>.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
