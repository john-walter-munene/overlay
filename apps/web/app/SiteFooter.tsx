import Link from 'next/link';

export default function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div>
          <strong>Overlay Bets</strong>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
            Verified tipster marketplace.
          </p>
        </div>
        <nav aria-label="Footer">
          <Link href="/marketplace">Marketplace</Link>
          <Link href="/blog">Blog</Link>
          <Link href="/legal/terms">Terms of Service</Link>
          <Link href="/legal/privacy">Privacy Policy</Link>
        </nav>
        <p className="site-footer__legal">
          Information only — Overlay Bets is a sports-information and analytics
          service. We take no bets, hold no stakes and are not a bookmaker. Picks
          and stats are for informational purposes only and are not betting or
          financial advice. 18+. Please gamble responsibly. © {year} Overlay
          Bets.
        </p>
      </div>
    </footer>
  );
}
