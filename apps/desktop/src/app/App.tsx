import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { useState } from 'react';

import { useAppliedAppearance } from '../features/settings';
import { useAppliedTheme } from '../features/theme';
import { AppShell } from './AppShell';

export function App() {
  const [queryClient] = useState(() => new QueryClient());
  useAppliedTheme();
  useAppliedAppearance();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={400}>
        <AppShell />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
