export const metadata = {
  title: 'Overlay Bets — Verified tipster marketplace',
  description:
    'Find the overlay. Beat the close. Tipsters ranked by verified ROI and closing line value — picks locked before kickoff.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          margin: 0,
          background: '#0b0e14',
          color: '#e6e6e6',
        }}
      >
        {children}
      </body>
    </html>
  );
}
