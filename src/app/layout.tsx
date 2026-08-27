import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { getLocale, getMessages } from 'next-intl/server';
import { AppIntlProvider } from '@/components/i18n/AppIntlProvider';

const inter = Inter({ subsets: ['latin', 'cyrillic'] });
const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : null;

export const metadata: Metadata = {
  title: 'Game Club Finance',
  description: 'Finance & Accounting for Game Club',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);

  return (
    <html lang={locale}>
      {supabaseOrigin ? (
        <head>
          <link rel="dns-prefetch" href={supabaseOrigin} />
          <link rel="preconnect" href={supabaseOrigin} crossOrigin="anonymous" />
        </head>
      ) : null}
      <body className={inter.className}>
        <AppIntlProvider initialLocale={locale} initialMessages={messages}>
          {children}
        </AppIntlProvider>
      </body>
    </html>
  );
}
