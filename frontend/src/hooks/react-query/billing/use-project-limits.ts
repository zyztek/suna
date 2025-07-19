'use client';

import { createQueryHook } from '@/hooks/use-query';
import { checkProjectLimits } from '@/lib/api';

export const useProjectLimits = createQueryHook(
  () => checkProjectLimits(),
  {
    queryKey: ['project-limits'],
    staleTime: 5 * 60 * 1000, // 5 minutes
    errorContext: {
      operation: 'check project limits',
      resource: 'project limits'
    }
  }
);