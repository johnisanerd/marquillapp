import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Special_Elite, Courier_Prime, Source_Code_Pro } from 'next/font/google';
import './globals.css';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ThemeScript from '@/components/ThemeScript';
import { Analytics } from '@vercel/analytics/next';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jbmono',
  weight: ['400', '500'],
  display: 'swap',
});

// Wordmark candidate faces
const specialElite = Special_Elite({
  subsets: ['latin'],
  variable: '--font-special-elite-raw',
  weight: '400',
  display: 'swap',
});

const courierPrime = Courier_Prime({
  subsets: ['latin'],
  variable: '--font-courier-prime-raw',
  weight: ['400', '700'],
  display: 'swap',
});

const sourceCodePro = Source_Code_Pro({
  subsets: ['latin'],
  variable: '--font-source-code-pro-raw',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://marquill.com'),
  title: {
    default: 'Marquill — Meet Mark, your LinkedIn agent',
    template: '%s | Marquill',
  },
  description:
    'Mark, the LinkedIn agent, is in public beta. He researches your topic, writes posts and polls, designs carousels and one-pagers in six Design Systems, and schedules them to your profile or company page.',
  openGraph: {
    title: 'Marquill — Meet Mark, your LinkedIn agent',
    description: 'Mark makes your LinkedIn posts, polls, and carousels. Public beta, free plan, no card.',
    type: 'website',
    locale: 'en_US',
    url: 'https://marquill.com',
    siteName: 'Marquill',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Marquill — Meet Mark, your LinkedIn agent',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Marquill — Meet Mark, your LinkedIn agent',
    description: 'Mark makes your LinkedIn posts, polls, and carousels. Public beta, free plan, no card.',
    images: ['/og-image.png'],
  },
  alternates: {
    canonical: 'https://marquill.com',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nodeEnvironment = process.env.NODE_ENVIRONMENT;
  const isProduction = nodeEnvironment === 'production';
  const showThemeToggle = nodeEnvironment === 'development';

  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${inter.variable} ${jetbrainsMono.variable} ${specialElite.variable} ${courierPrime.variable} ${sourceCodePro.variable}`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript forceDark={isProduction} />
      </head>
      <body className="antialiased">
        <a href="#main-content" className="skip-to-content">
          Skip to main content
        </a>
        <Header showThemeToggle={showThemeToggle} />
        <main id="main-content">{children}</main>
        <Footer />
        <Analytics />
      </body>
    </html>
  );
}
