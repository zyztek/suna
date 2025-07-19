'use client';

import { createMutationHook } from '@/hooks/use-query';
import { 
  createProject, 
  updateProject, 
  deleteProject,
  Project,
  checkProjectLimits
} from '@/lib/api';
import { toast } from 'sonner';
import { projectKeys } from './keys';

export const useCreateProject = createMutationHook(
  async (data: { name: string; description: string; accountId?: string }) => {
    // Check project limits before creating
    try {
      const limits = await checkProjectLimits();
      if (!limits.can_create) {
        throw new Error(limits.message);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Project limit')) {
        toast.error(error.message);
        throw error;
      }
      // For other errors, let the backend handle the limit check
    }
    
    return createProject(data, data.accountId);
  },
  {
    onSuccess: () => {
      toast.success('Project created successfully');
    },
    errorContext: {
      operation: 'create project',
      resource: 'project'
    }
  }
);

export const useUpdateProject = createMutationHook(
  ({ projectId, data }: { projectId: string; data: Partial<Project> }) => 
    updateProject(projectId, data),
  {
    onSuccess: () => {
    //   toast.success('Project updated successfully');
    },
    errorContext: {
      operation: 'update project',
      resource: 'project'
    }
  }
);

export const useDeleteProject = createMutationHook(
  ({ projectId }: { projectId: string }) => deleteProject(projectId),
  {
    onSuccess: () => {
      toast.success('Project deleted successfully');
    },
    errorContext: {
      operation: 'delete project',
      resource: 'project'
    }
  }
); 