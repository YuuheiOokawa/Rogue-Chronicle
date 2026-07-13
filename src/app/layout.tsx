import type { Metadata, Viewport } from 'next';

import './globals.css';

import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Rogue Chronicle',
  description:
    '挑戦するたびに変化するダンジョンを攻略するローグライトRPG。敗北しても記録は残り、拠点はあなたを強くする。',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0F1117',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-surface-base text-content">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
