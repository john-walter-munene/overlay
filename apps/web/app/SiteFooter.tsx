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
          <Link href="/login">Sign in</Link>
          <Link href="/signup">Get started</Link>
        </nav>
        <p className="site-footer__legal">
          © {year} Overlay Bets. Picks are for informational purposes only and
          are not betting or financial advice. 18+. Please gamble responsibly.
        </p>
      </div>
    </footer>
  );
}
