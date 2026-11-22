import { useLocation } from '@tanstack/react-router';
import { AlertBanner, Footer, TopBar } from './components/Shell';
import { useAirBoot } from './state/useAir';

export default function AirLayout({ children }) {
  useAirBoot();
  const isMap = useLocation().pathname === '/';
  return (
    <div className={isMap ? 'app app--map' : 'app'}>
      <TopBar />
      <AlertBanner />
      {children}
      {!isMap && <Footer />}
    </div>
  );
}