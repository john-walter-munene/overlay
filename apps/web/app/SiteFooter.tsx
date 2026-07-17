import Link from 'next/link';

export default function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div>
          <strong>Overlay Bets</strong>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
            Verified tipsters, ranked by real edge.
          </p>
        </div>
        <nav aria-label="Footer">
          <Link href="/about">About</Link>
          <Link href="/legal/terms">Terms of Service</Link>
          <Link href="/legal/privacy">Privacy Policy</Link>
          <Link href="/legal/responsible-gambling">Responsible Gambling</Link>
        </nav>
        <p className="site-footer__legal">
          © {year} Overlay Bets · Information only · 18+ · Please gamble
          responsibly.
        </p>
      </div>
    </footer>
  );
}
