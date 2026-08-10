import Link from 'next/link';
import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('about');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: { canonical: '/about' },
  };
}

const cardStyle = {
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  borderRadius: 10,
  padding: '1rem 1.25rem',
} as const;

export default function AboutPage() {
  const t = useTranslations('about');
  const bettorSteps = [
    { title: t('bettorStep1Title'), body: t('bettorStep1Body') },
    { title: t('bettorStep2Title'), body: t('bettorStep2Body') },
    { title: t('bettorStep3Title'), body: t('bettorStep3Body') },
  ];
  const tipsterSteps = [
    { title: t('tipsterStep1Title'), body: t('tipsterStep1Body') },
    { title: t('tipsterStep2Title'), body: t('tipsterStep2Body') },
    { title: t('tipsterStep3Title'), body: t('tipsterStep3Body') },
    { title: t('tipsterStep4Title'), body: t('tipsterStep4Body') },
  ];
  const pillars = [
    { title: t('pillar1Title'), body: t('pillar1Body') },
    { title: t('pillar2Title'), body: t('pillar2Body') },
    { title: t('pillar3Title'), body: t('pillar3Body') },
    { title: t('pillar4Title'), body: t('pillar4Body') },
  ];
  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <p style={{ margin: 0 }}>
        <Link href="/" style={{ color: 'var(--accent)' }}>
          {t('backHome')}
        </Link>
      </p>
      <h1 style={{ fontSize: '2.3rem', marginBottom: '0.25rem' }}>
        {t('title')}
      </h1>
      <p style={{ color: 'var(--muted)', marginTop: 0, fontSize: '1.05rem' }}>
        {t('subtitle')}
      </p>

      <div style={{ color: 'var(--fg)', lineHeight: 1.7 }}>
        <h2>{t('missionTitle')}</h2>
        <p>{t('missionP1')}</p>
        <p>{t('missionP2')}</p>

        <h2>{t('bettorsTitle')}</h2>
        <ol style={{ paddingLeft: '1.1rem' }}>
          {bettorSteps.map((step) => (
            <li key={step.title} style={{ marginBottom: '0.75rem' }}>
              <strong>{step.title}.</strong> {step.body}
            </li>
          ))}
        </ol>

        <h2>{t('tipstersTitle')}</h2>
        <ol style={{ paddingLeft: '1.1rem' }}>
          {tipsterSteps.map((step) => (
            <li key={step.title} style={{ marginBottom: '0.75rem' }}>
              <strong>{step.title}.</strong> {step.body}
            </li>
          ))}
        </ol>

        <h2>{t('trustTitle')}</h2>
        <p>{t('trustIntro')}</p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1rem',
            margin: '1.25rem 0',
          }}
        >
          {pillars.map((pillar) => (
            <section key={pillar.title} style={cardStyle}>
              <strong style={{ color: 'var(--accent)' }}>{pillar.title}</strong>
              <p style={{ margin: '0.4rem 0 0' }}>{pillar.body}</p>
            </section>
          ))}
        </div>
        <p>
          {t.rich('seeItAction', {
            link: (chunks) => (
              <Link href="/tipsters" style={{ color: 'var(--accent)' }}>
                {chunks}
              </Link>
            ),
          })}
        </p>

        <section
          style={{
            ...cardStyle,
            margin: '2rem 0 0',
          }}
        >
          <strong style={{ color: 'var(--warning)' }}>
            {t('responsibleTitle')}
          </strong>
          <p style={{ margin: '0.5rem 0 0' }}>
            {t.rich('responsibleBody', {
              link: (chunks) => (
                <Link
                  href="/legal/responsible-gambling"
                  style={{ color: 'var(--accent)' }}
                >
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </section>
      </div>
    </main>
  );
}
