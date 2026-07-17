import Link from 'next/link';

export default function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        {/* Brand */}
        <div className="site-footer__brand">
          <strong>Overlay Bets</strong>
          <p>
            Verified tipsters, ranked by real edge. Every pick locked before
            kickoff.
          </p>
        </div>

        {/* Product */}
        <nav className="site-footer__column" aria-label="Product">
          <h3>Product</h3>
          <Link href="/tipsters">Tipsters</Link>
          <Link href="/tips">Free tips</Link>
          <Link href="/tools/odds-calculator">Betting Calculator</Link>
        </nav>

        {/* Company */}
        <nav className="site-footer__column" aria-label="Company">
          <h3>Company</h3>
          <Link href="/about">About</Link>
          <Link href="/how-it-works">How it works</Link>
          <Link href="/newsletter">Newsletter</Link>
        </nav>

        {/* Resources */}
        <nav className="site-footer__column" aria-label="Resources">
          <h3>Resources</h3>
          <Link href="/support">Support Center</Link>
          <Link href="/content">Content</Link>
          <Link href="/news">News</Link>
        </nav>

        {/* Legal */}
        <nav className="site-footer__column" aria-label="Legal">
          <h3>Legal</h3>
          <Link href="/legal/terms">Terms of Service</Link>
          <Link href="/legal/privacy">Privacy Policy</Link>
          <Link href="/legal/responsible-gambling">Responsible Gambling</Link>
        </nav>

        {/* Disclaimer */}
        <div className="site-footer__bottom">
          <p>
            Information only — Overlay Bets is a sports-information and analytics
            service. We do not accept bets, hold stakes, or operate as a
            bookmaker. Picks and statistics are informational only and are not
            betting or financial advice. 18+. Please gamble responsibly.
          </p>
          <p>© {year} Overlay Bets. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
