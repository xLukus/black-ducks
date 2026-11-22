import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
const BasinPage = lazy(() => import('@/features/air-quality/views/BasinPage'));
export const Route = createFileRoute('/basin')({
  head: () => ({ meta: [
    { title: 'Why winter is worse · Breathe Ljubljana' },
    { name: 'description', content: 'Explore how winter inversions trap smoke in the Ljubljana basin, with ten years of ARSO measurements.' },
    { property: 'og:title', content: 'Why winter is worse · Breathe Ljubljana' },
    { property: 'og:description', content: 'The bowl, the inversion lid, and the history of Ljubljana’s winter air.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary_large_image' },
  ] }),
  component: () => <ClientOnly><Suspense fallback={<div className="page"><span className="spinner" /></div>}><BasinPage /></Suspense></ClientOnly>,
});