import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { getLocale } from 'next-intl/server';
import { AppIntlProvider } from '@/components/i18n/AppIntlProvider';

const inter = Inter({ subsets: ['latin', 'cyrillic'] });

export const metadata: Metadata = {
  title: 'Game Club Finance',
  description: 'Finance & Accounting for Game Club',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();

  return (
    <html lang={locale}>
      <body className={inter.className}>
        <AppIntlProvider initialLocale={locale}>
          {children}
        </AppIntlProvider>
      </body>
    </html>
  );
}
