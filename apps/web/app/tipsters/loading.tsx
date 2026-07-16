export default function TipstersLoading() {
  return (
    <main style={{ maxWidth: 1080, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <h1 style={{ fontSize: '2.2rem', marginBottom: '0.25rem' }}>Tipsters</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        Loading verified tipsters…
      </p>
      <div style={{ marginTop: '2rem' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            aria-hidden
            style={{
              height: 44,
              borderTop: '1px solid var(--border)',
              background:
                'linear-gradient(90deg, var(--surface) 25%, var(--surface-2) 50%, var(--surface) 75%)',
              opacity: 0.6,
            }}
          />
        ))}
      </div>
    </main>
  );
}
