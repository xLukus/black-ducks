import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
const HeatingPage = lazy(() => import('@/features/air-quality/views/HeatingPage'));
export const Route = createFileRoute('/heating')({
  head: () => ({ meta: [
    { title: 'Heating plan · Breathe Ljubljana' },
    { name: 'description', content: 'Compare cleaner heating scenarios around Ljubljana schools and care homes, including smoke reductions, exposure, and costs.' },
    { property: 'og:title', content: 'Heating plan · Breathe Ljubljana' },
    { property: 'og:description', content: 'Estimate what replacing stoves, district heating, or a burn ban would change.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary_large_image' },
  ] }),
  component: () => <ClientOnly><Suspense fallback={<div className="page"><span className="spinner" /></div>}><HeatingPage /></Suspense></ClientOnly>,
});