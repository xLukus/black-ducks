import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

const MapPage = lazy(() => import('@/features/air-quality/views/MapPage'));
export const Route = createFileRoute('/')({
  head: () => ({ meta: [
    { title: 'Breathe Ljubljana · Air quality map' },
    { name: 'description', content: 'Air quality across Ljubljana with hourly measurements, forecasts, and personalised outdoor and ventilation advice.' },
    { property: 'og:title', content: 'Breathe Ljubljana · Air quality map' },
    { property: 'og:description', content: 'Explore the basin map and find cleaner hours to go outside and air your home.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary_large_image' },
  ] }),
  component: Index,
});
function Index() {
  return <ClientOnly fallback={<div className="page"><span className="spinner" /></div>}>
    <Suspense fallback={<div className="page"><span className="spinner" /></div>}><MapPage /></Suspense>
  </ClientOnly>;
}
