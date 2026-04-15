import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Use - MTG Ink",
  description: "Terms of use for MTG Ink.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white py-12">
      <div className="max-w-3xl mx-auto px-4">
        <h1 className="text-3xl font-bold mb-2">Terms of Use</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: April 15, 2026</p>

        <div className="space-y-8 text-sm text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">1. About MTG Ink</h2>
            <p>
              MTG Ink is an independent fan project for discovering and ranking Magic: The Gathering card art. It is not affiliated with, endorsed by, or sponsored by Wizards of the Coast, Hasbro, or any of their subsidiaries. Card images and data are provided by{" "}
              <a href="https://scryfall.com" target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:text-amber-300">Scryfall</a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">2. Use of the Site</h2>
            <p>You agree to use MTG Ink in good faith. Specifically, you agree not to:</p>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li>Manipulate votes, ratings, or brackets through automated means</li>
              <li>Scrape or bulk-download content from the site</li>
              <li>Abuse the site in any way that degrades the experience for others</li>
              <li>Attempt to access other users&rsquo; accounts or data</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">3. Accounts</h2>
            <p>
              You may use MTG Ink without an account. If you create one, you are responsible for keeping your login credentials secure. We may suspend or delete accounts that violate these terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">4. User Content</h2>
            <p>
              Decks, brackets, and other content you create on MTG Ink remain yours. By using the site, you grant us a license to store and display that content as part of the service (e.g., shared bracket results, public deck lists).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">5. Intellectual Property</h2>
            <p>
              Magic: The Gathering, card names, card images, mana symbols, and related trademarks are property of Wizards of the Coast LLC. MTG Ink uses card data and images under Scryfall&rsquo;s terms and Wizards of the Coast&rsquo;s fan content policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">6. Giveaways</h2>
            <p>
              Giveaways are subject to their own{" "}
              <a href="/giveaway/rules" className="text-amber-400 hover:text-amber-300">Official Rules</a>.
              Participation requires a registered account with a valid email address.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">7. Disclaimer</h2>
            <p>
              MTG Ink is provided &ldquo;as is&rdquo; without warranties of any kind. We do our best to keep the site running and data accurate, but we make no guarantees about uptime, data completeness, or price accuracy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">8. Limitation of Liability</h2>
            <p>
              MTG Ink and its operators are not liable for any damages arising from your use of the site, including but not limited to purchasing decisions made based on price data displayed here.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">9. Changes</h2>
            <p>
              We may update these terms from time to time. Continued use of the site after changes constitutes acceptance of the updated terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">10. Contact</h2>
            <p>
              Questions about these terms? Email us at{" "}
              <a href="mailto:hello@mtg.ink" className="text-amber-400 hover:text-amber-300">hello@mtg.ink</a>.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
