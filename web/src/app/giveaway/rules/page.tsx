import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "April Giveaway Official Rules — MTG Ink",
  description: "Official rules for the MTG Ink April 2026 Secrets of Strixhaven Booster Box giveaway.",
};

export default function GiveawayRulesPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-12 text-zinc-300">
      <h1 className="text-2xl font-bold text-white mb-6">
        MTG Ink April 2026 Giveaway — Official Rules
      </h1>

      <p className="font-bold text-amber-400 mb-6 uppercase">
        No Purchase Necessary to Enter or Win.
      </p>

      <section className="space-y-4 text-sm leading-relaxed">
        <div>
          <h2 className="text-white font-semibold mb-1">1. Sponsor</h2>
          <p>
            MTG Ink (&ldquo;Sponsor&rdquo;). Contact: giveaway@mtg.ink
          </p>
        </div>

        <div>
          <h2 className="text-white font-semibold mb-1">2. Eligibility</h2>
          <p>
            Open to legal residents of the United States and Canada (excluding Quebec) who are
            at least 18 years of age or the age of majority in their jurisdiction of residence,
            whichever is older, at the time of entry. Employees of Sponsor and their immediate
            family members are not eligible. Void where prohibited by law.
          </p>
        </div>

        <div>
          <h2 className="text-white font-semibold mb-1">3. Entry Period</h2>
          <p>
            The giveaway begins at 12:00 AM Eastern Time on April 1, 2026 and ends at
            11:59 PM Eastern Time on April 30, 2026 (the &ldquo;Entry Period&rdquo;).
          </p>
        </div>

        <div>
          <h2 className="text-white font-semibold mb-1">4. How to Enter</h2>
          <p>
            During the Entry Period, create a free account on mtg.ink (or sign in to an
            existing account) and complete the free daily gauntlet challenge. Each completed
            daily gauntlet while signed in constitutes one (1) entry. You may earn up to one
            (1) entry per day, for a maximum of thirty (30) entries during the Entry Period.
            No purchase is necessary — account creation and the daily gauntlet are free.
          </p>
        </div>

        <div>
          <h2 className="text-white font-semibold mb-1">5. Prize</h2>
          <p>
            One (1) winner will receive one (1) Secrets of Strixhaven Play Booster Box.
            Approximate Retail Value (&ldquo;ARV&rdquo;): $150 USD. Prize is non-transferable
            and no substitution or cash equivalent will be provided, except at Sponsor&rsquo;s
            sole discretion. Sponsor reserves the right to substitute a prize of equal or
            greater value if the advertised prize becomes unavailable.
          </p>
        </div>

        <div>
          <h2 className="text-white font-semibold mb-1">6. Winner Selection</h2>
          <p>
            One (1) winner will be selected by random drawing from all eligible entries
            received during the Entry Period. The drawing will take place on or about
            May 1, 2026. Odds of winning depend on the total number of eligible entries
            received.
          </p>
        </div>

        <div>
          <h2 className="text-white font-semibold mb-1">7. Winner Notification</h2>
          <p>
            The winner will be notified via the email address associated with their MTG Ink
            account. The winner must respond within seven (7) days of notification or an
            alternate winner may be selected. To receive the prize, the winner must have a
            registered MTG Ink account with a valid email address.
          </p>
        </div>

        <div>
          <h2 className="text-white font-semibold mb-1">8. Canadian Residents</h2>
          <p>
            Canadian residents who are selected as a potential winner must correctly answer a
            time-limited mathematical skill-testing question as a condition of receiving the
            prize, in compliance with Canadian law.
          </p>
        </div>

        <div>
          <h2 className="text-white font-semibold mb-1">9. Privacy</h2>
          <p>
            The Sponsor collects personal information solely for the purpose of administering
            the giveaway and contacting the winner. Email addresses will be used only for
            winner notification and will not be shared with third parties or used for marketing
            purposes without consent.
          </p>
        </div>

        <div>
          <h2 className="text-white font-semibold mb-1">10. General Conditions</h2>
          <p>
            Sponsor reserves the right to cancel, suspend, or modify the giveaway if fraud,
            technical failures, or any other factor beyond Sponsor&rsquo;s reasonable control
            impairs the integrity or proper functioning of the giveaway. Sponsor reserves the
            right, in its sole discretion, to disqualify any individual who tampers with the
            entry process or violates these Official Rules. By entering, participants agree to
            be bound by these Official Rules and the decisions of the Sponsor, which are final
            and binding in all respects.
          </p>
        </div>

        <div>
          <h2 className="text-white font-semibold mb-1">11. Limitations of Liability</h2>
          <p>
            By entering, participants release and hold harmless the Sponsor from any and all
            liability, claims, or actions arising out of participation in the giveaway or
            acceptance, use, or misuse of any prize.
          </p>
        </div>

        <div>
          <h2 className="text-white font-semibold mb-1">12. Winner List</h2>
          <p>
            For the name of the winner (available after May 8, 2026), send an email to
            giveaway@mtg.ink with the subject line &ldquo;April 2026 Giveaway Winner.&rdquo;
          </p>
        </div>
      </section>

      <p className="mt-8 text-xs text-zinc-500">
        MTG Ink is not affiliated with, endorsed by, or sponsored by Wizards of the Coast LLC
        or Hasbro, Inc. Magic: The Gathering is a trademark of Wizards of the Coast LLC.
      </p>
    </main>
  );
}
