import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function SiteFooter() {
  const t = useTranslations('footer');
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        {/* Brand */}
        <div className="site-footer__brand">
          <span className="site-footer__brand-lockup">
            <img
              src="/logo-mark.png"
              alt=""
              width={28}
              height={28}
              className="site-footer__mark"
            />
            <strong>
              <span className="site-footer__wordmark-accent">Overlay</span> Picks
            </strong>
          </span>
          <p>{t('tagline')}</p>
        </div>

        {/* Product */}
        <nav className="site-footer__column" aria-label={t('product')}>
          <h3>{t('product')}</h3>
          <Link href="/tipsters">{t('tipsters')}</Link>
          <Link href="/tips">{t('dailyPicks')}</Link>
          <Link href="/tools/odds-calculator">{t('calculator')}</Link>
        </nav>

        {/* Company */}
        <nav className="site-footer__column" aria-label={t('company')}>
          <h3>{t('company')}</h3>
          <Link href="/about">{t('about')}</Link>
          <Link href="/how-it-works">{t('howItWorks')}</Link>
          <Link href="/newsletter">{t('newsletter')}</Link>
        </nav>

        {/* Resources */}
        <nav className="site-footer__column" aria-label={t('resources')}>
          <h3>{t('resources')}</h3>
          <Link href="/support">{t('supportCenter')}</Link>
          <Link href="/content">{t('content')}</Link>
          <Link href="/news">{t('news')}</Link>
        </nav>

        {/* Legal */}
        <nav className="site-footer__column" aria-label={t('legal')}>
          <h3>{t('legal')}</h3>
          <Link href="/legal/terms">{t('terms')}</Link>
          <Link href="/legal/privacy">{t('privacy')}</Link>
          <Link href="/legal/responsible-gambling">
            {t('responsibleGambling')}
          </Link>
        </nav>

        {/* Disclaimer */}
        <div className="site-footer__bottom">
          <p>{t('disclaimer')}</p>
          <p>{t('copyright', { year })}</p>
        </div>
      </div>
    </footer>
  );
}
