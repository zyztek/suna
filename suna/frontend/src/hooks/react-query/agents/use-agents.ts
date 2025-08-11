import { createMutationHook, createQueryHook } from '@/hooks/use-query';
import { useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { toast } from 'sonner';
import { agentKeys } from './keys';
import { Agent, AgentUpdateRequest, AgentsParams, createAgent, deleteAgent, getAgent, getAgents, getThreadAgent, updateAgent, AgentBuilderChatRequest, AgentBuilderStreamData, startAgentBuilderChat, getAgentBuilderChatHistory } from './utils';
import { useRef, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { generateRandomAvatar } from '@/lib/utils/_avatar-generator';
import { DEFAULT_AGENTPRESS_TOOLS } from '@/components/agents/tools';

export const useAgents = (
  params: AgentsParams = {},
  customOptions?: Omit<
    UseQueryOptions<Awaited<ReturnType<typeof getAgents>>, Error, Awaited<ReturnType<typeof getAgents>>, ReturnType<typeof agentKeys.list>>,
    'queryKey' | 'queryFn'
  >,
) => {
  return createQueryHook(
    agentKeys.list(params),
    () => getAgents(params),
    {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    }
  )(customOptions);
};

export const useAgent = (agentId: string) => {
  return createQueryHook(
    agentKeys.detail(agentId),
    () => getAgent(agentId),
    {
      enabled: !!agentId,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    }
  )();
};

export const useCreateAgent = () => {
  const queryClient = useQueryClient();
  
  return createMutationHook(
    createAgent,
    {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: agentKeys.lists() });
        queryClient.setQueryData(agentKeys.detail(data.agent_id), data);
        toast.success('Agent created successfully');
      },
      onError: async (error) => {
        const { AgentCountLimitError } = await import('@/lib/api');
        if (error instanceof AgentCountLimitError) {
          return;
        }
        console.error('Error creating agent:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to create agent');
      },
    }
  )();
};

export const useCreateNewAgent = () => {
  const router = useRouter();
  const createAgentMutation = useCreateAgent();
  
  return createMutationHook(
    async (_: void) => {
      const { avatar, avatar_color } = generateRandomAvatar();
      
      const defaultAgentData = {
        name: 'New Agent',
        description: '',
        avatar,
        avatar_color,
        configured_mcps: [],
        agentpress_tools: DEFAULT_AGENTPRESS_TOOLS,
        is_default: false,
      };

      const newAgent = await createAgentMutation.mutateAsync(defaultAgentData);
      return newAgent;
    },
    {
      onSuccess: (newAgent) => {
        router.push(`/agents/config/${newAgent.agent_id}`);
      },
      onError: (error) => {
        console.error('Error creating agent:', error);
        toast.error('Failed to create agent. Please try again.');
      },
    }
  )();
};

export const useUpdateAgent = () => {
  const queryClient = useQueryClient();
  
  return createMutationHook(
    ({ agentId, ...data }: { agentId: string } & AgentUpdateRequest) => 
      updateAgent(agentId, data),
    {
      onSuccess: (data, variables) => {
        // Update the cache directly 
        queryClient.setQueryData(agentKeys.detail(variables.agentId), data);
        // Invalidate lists view to update agent lists
        queryClient.invalidateQueries({ queryKey: agentKeys.lists() });
      },
    }
  )();
};

export const useDeleteAgent = () => {
  const queryClient = useQueryClient();
  
  return createMutationHook(
    deleteAgent,
    {
      onMutate: async (agentId) => {
        // Cancel any outgoing refetches
        await queryClient.cancelQueries({ queryKey: agentKeys.lists() });
        
        // Snapshot the previous value
        const previousAgents = queryClient.getQueriesData({ queryKey: agentKeys.lists() });
        
        // Optimistically update to remove the agent
        queryClient.setQueriesData({ queryKey: agentKeys.lists() }, (old: any) => {
          if (!old || !old.agents) return old;
          
          return {
            ...old,
            agents: old.agents.filter((agent: any) => agent.agent_id !== agentId),
            pagination: old.pagination ? {
              ...old.pagination,
              total: Math.max(0, old.pagination.total - 1)
            } : undefined
          };
        });
        
        return { previousAgents };
      },
      onError: (err, agentId, context) => {
        // Revert the optimistic update on error
        if (context?.previousAgents) {
          context.previousAgents.forEach(([queryKey, data]) => {
            queryClient.setQueryData(queryKey, data);
          });
        }
        toast.error('Failed to delete agent. Please try again.');
      },
      onSuccess: (_, agentId) => {
        // Remove the individual agent query
        queryClient.removeQueries({ queryKey: agentKeys.detail(agentId) });
        toast.success('Agent deleted successfully');
      },
      onSettled: () => {
        // Always invalidate to ensure consistency
        queryClient.invalidateQueries({ queryKey: agentKeys.lists() });
      },
    }
  )();
};

export const useOptimisticAgentUpdate = () => {
  const queryClient = useQueryClient();
  
  return {
    optimisticallyUpdateAgent: (agentId: string, updates: Partial<Agent>) => {
      queryClient.setQueryData(
        agentKeys.detail(agentId),
        (oldData: Agent | undefined) => {
          if (!oldData) return oldData;
          return { ...oldData, ...updates };
        }
      );
    },
    
    revertOptimisticUpdate: (agentId: string) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.detail(agentId) });
    },
  };
};

export const useAgentDeletionState = () => {
  const [deletingAgents, setDeletingAgents] = useState<Set<string>>(new Set());
  const deleteAgentMutation = useDeleteAgent();

  const deleteAgent = useCallback(async (agentId: string) => {
    // Add to deleting set immediately for UI feedback
    setDeletingAgents(prev => new Set(prev).add(agentId));
    
    try {
      await deleteAgentMutation.mutateAsync(agentId);
    } finally {
      // Remove from deleting set regardless of success/failure
      setDeletingAgents(prev => {
        const newSet = new Set(prev);
        newSet.delete(agentId);
        return newSet;
      });
    }
  }, [deleteAgentMutation]);

  return {
    deleteAgent,
    isDeletingAgent: (agentId: string) => deletingAgents.has(agentId),
    isDeleting: deleteAgentMutation.isPending,
  };
};

export const useThreadAgent = (threadId: string) => {
  return createQueryHook(
    agentKeys.threadAgent(threadId),
    () => getThreadAgent(threadId),
    {
      enabled: !!threadId,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    }
  )();
};

export const useAgentBuilderChat = () => {
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (
    request: AgentBuilderChatRequest,
    callbacks: {
      onData: (data: AgentBuilderStreamData) => void;
      onComplete: () => void;
      onError?: (error: Error) => void;
    }
  ) => {
    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();

    try {
      await startAgentBuilderChat(
        request,
        callbacks.onData,
        callbacks.onComplete,
        abortControllerRef.current.signal
      );
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Error in agent builder chat:', error);
        callbacks.onError?.(error);
      }
    } finally {
      abortControllerRef.current = null;
    }
  }, []);

  const cancelStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  return {
    sendMessage,
    cancelStream,
  };
};

export const useAgentBuilderChatHistory = (agentId: string) =>
  createQueryHook(
    agentKeys.builderChatHistory(agentId),
    () => getAgentBuilderChatHistory(agentId),
    {
      enabled: !!agentId,
      retry: 1,
    }
  )();