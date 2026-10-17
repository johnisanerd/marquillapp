import Hero from '@/components/landing/Hero';
import StatusBoard from '@/components/landing/StatusBoard';
import WhatMarkMakes from '@/components/landing/WhatMarkMakes';
import DesignSystems from '@/components/landing/DesignSystems';
import OneWorkspace from '@/components/landing/OneWorkspace';
import Changelog from '@/components/landing/Changelog';
import Pricing from '@/components/landing/Pricing';
import ClosingCta from '@/components/landing/ClosingCta';
import { normalizeAppUrl } from '@/config/urls';

export const metadata = {
  title: 'Marquill — Meet Mark, your LinkedIn agent',
  description:
    'Mark, the LinkedIn agent, is in public beta. He researches your topic, writes posts and polls, designs carousels and one-pagers in six Design Systems, and schedules them to your profile or company page.',
  keywords:
    'AI LinkedIn agent, LinkedIn post generator, LinkedIn carousel maker, LinkedIn document posts, LinkedIn polls, LinkedIn scheduling, company page publishing',
  alternates: {
    canonical: 'https://marquill.com',
  },
  openGraph: {
    title: 'Marquill — Meet Mark, your LinkedIn agent',
    description: 'Mark makes your LinkedIn posts, polls, and carousels. Public beta, free plan, no card.',
    type: 'website',
    locale: 'en_US',
    url: 'https://marquill.com',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Marquill — Meet Mark, your LinkedIn agent',
    description: 'Mark makes your LinkedIn posts, polls, and carousels. Public beta, free plan, no card.',
    images: ['/og-image.png'],
  },
};

export default function Home() {
  const appUrl = normalizeAppUrl(process.env.NEXT_PUBLIC_APP_URL);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: 'Marquill',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        description:
          'Marquill is an AI LinkedIn workspace in public beta. Mark, the LinkedIn agent, researches a topic, writes posts and polls, designs carousels and one-pagers in six Design Systems, and schedules publishing to personal profiles and company pages.',
        url: 'https://marquill.com',
        offers: [
          { '@type': 'Offer', price: '0', priceCurrency: 'USD', name: 'Free Plan' },
          { '@type': 'Offer', price: '9.99', priceCurrency: 'USD', name: 'Starter Plan' },
          { '@type': 'Offer', price: '19.99', priceCurrency: 'USD', name: 'Creator Plan' },
          { '@type': 'Offer', price: '29.99', priceCurrency: 'USD', name: 'Pro Writer Plan' },
        ],
      },
      {
        '@type': 'Organization',
        name: 'Marquill',
        url: 'https://marquill.com',
        logo: 'https://marquill.com/logo.svg',
        contactPoint: {
          '@type': 'ContactPoint',
          email: 'hello@marquill.com',
          contactType: 'customer support',
        },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Hero appUrl={appUrl} />
      <StatusBoard />
      <WhatMarkMakes />
      <DesignSystems />
      <OneWorkspace />
      <Changelog />
      <Pricing appUrl={appUrl} />
      <ClosingCta appUrl={appUrl} />
    </>
  );
}
