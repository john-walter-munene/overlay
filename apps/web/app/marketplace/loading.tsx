export default function MarketplaceLoading() {
  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <h1 style={{ fontSize: '2.2rem', marginBottom: '0.25rem' }}>
        Tipster Marketplace
      </h1>
      <p style={{ color: '#9aa4b2', marginTop: 0 }}>
        Loading verified tipsters…
      </p>
      <div style={{ marginTop: '2rem' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            aria-hidden
            style={{
              height: 44,
              borderTop: '1px solid #1c2430',
              background:
                'linear-gradient(90deg, #0f141c 25%, #131a24 50%, #0f141c 75%)',
              opacity: 0.6,
            }}
          />
        ))}
      </div>
    </main>
  );
}
