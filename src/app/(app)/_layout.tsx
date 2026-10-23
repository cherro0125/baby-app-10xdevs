import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { PartnerProvider } from '@/hooks/use-partner';

export default function AppLayout() {
  return (
    <PartnerProvider>
      <AnimatedSplashOverlay />
      <AppTabs />
    </PartnerProvider>
  );
}
