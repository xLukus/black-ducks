import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
const SensorsPage = lazy(() => import('@/features/air-quality/views/SensorsPage'));
export const Route = createFileRoute('/sensors')({
  head: () => ({ meta: [
    { title: 'Sensor plan · Breathe Ljubljana' },
    { name: 'description', content: 'Rank new air-quality sensor locations across Ljubljana by exposure, pollution, coverage gaps, and model uncertainty.' },
    { property: 'og:title', content: 'Sensor plan · Breathe Ljubljana' },
    { property: 'og:description', content: 'Find where Ljubljana’s next air-quality sensors should go.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary_large_image' },
  ] }),
  component: () => <ClientOnly><Suspense fallback={<div className="page"><span className="spinner" /></div>}><SensorsPage /></Suspense></ClientOnly>,
});