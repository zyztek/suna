'use client';

import React, { useState, Suspense, useEffect, useRef } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';
import { Menu, ChevronDown, Edit } from 'lucide-react';
import {
  ChatInput,
  ChatInputHandles,
} from '@/components/thread/chat-input/chat-input';
import {
  initiateAgent,
  createThread,
  addUserMessage,
  startAgent,
  createProject,
  BillingError,
} from '@/lib/api';
import { generateThreadName } from '@/lib/actions/threads';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSidebar } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useBillingError } from '@/hooks/useBillingError';
import { BillingErrorAlert } from '@/components/billing/usage-limit-alert';
import { useAccounts } from '@/hooks/use-accounts';
import { isLocalMode, config } from '@/lib/config';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AgentConfigurator } from '@/components/agent-configurator';

// Constant for localStorage key to ensure consistency
const PENDING_PROMPT_KEY = 'pendingAgentPrompt';

// Agent definitions
const AGENTS = [
  {
    id: 'suna',
    name: 'Suna',
    description: 'General-purpose AI assistant for coding, writing, and problem-solving',
  },
  {
    id: 'code-expert',
    name: 'Code Expert',
    description: 'Specialized in software development, debugging, and code reviews',
  },
  {
    id: 'writer',
    name: 'Writer',
    description: 'Focused on content creation, copywriting, and documentation',
  },
  {
    id: 'analyst',
    name: 'Analyst',
    description: 'Data analysis, research, and business intelligence specialist',
  },
];

function DashboardContent() {
  const [inputValue, setInputValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [autoSubmit, setAutoSubmit] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState('suna');
  const [showAgentConfigurator, setShowAgentConfigurator] = useState(false);
  const { billingError, handleBillingError, clearBillingError } =
    useBillingError();
  const router = useRouter();
  const isMobile = useIsMobile();
  const { setOpenMobile } = useSidebar();
  const { data: accounts } = useAccounts();
  const personalAccount = accounts?.find((account) => account.personal_account);
  const chatInputRef = useRef<ChatInputHandles>(null);

  const secondaryGradient =
    'bg-gradient-to-r from-blue-500 to-blue-500 bg-clip-text text-transparent';

  const selectedAgentData = AGENTS.find(agent => agent.id === selectedAgent) || AGENTS[0];

  const handleSubmit = async (
    message: string,
    options?: {
      model_name?: string;
      enable_thinking?: boolean;
      reasoning_effort?: string;
      stream?: boolean;
      enable_context_manager?: boolean;
    },
  ) => {
    if (
      (!message.trim() && !chatInputRef.current?.getPendingFiles().length) ||
      isSubmitting
    )
      return;

    setIsSubmitting(true);

    try {
      const files = chatInputRef.current?.getPendingFiles() || [];
      localStorage.removeItem(PENDING_PROMPT_KEY);

      // Always use FormData for consistency
      const formData = new FormData();
      formData.append('prompt', message);

      // Append files if present
      files.forEach((file, index) => {
        formData.append('files', file, file.name);
      });

      // Append options
      if (options?.model_name) formData.append('model_name', options.model_name);
      formData.append('enable_thinking', String(options?.enable_thinking ?? false));
      formData.append('reasoning_effort', options?.reasoning_effort ?? 'low');
      formData.append('stream', String(options?.stream ?? true));
      formData.append('enable_context_manager', String(options?.enable_context_manager ?? false));

      console.log('FormData content:', Array.from(formData.entries()));

      const result = await initiateAgent(formData);
      console.log('Agent initiated:', result);

      if (result.thread_id) {
        router.push(`/agents/${result.thread_id}`);
      } else {
        throw new Error('Agent initiation did not return a thread_id.');
      }
      chatInputRef.current?.clearPendingFiles();
    } catch (error: any) {
      console.error('Error during submission process:', error);
      if (error instanceof BillingError) {
        console.log('Handling BillingError:', error.detail);
        handleBillingError({
          message:
            error.detail.message ||
            'Monthly usage limit reached. Please upgrade your plan.',
          currentUsage: error.detail.currentUsage as number | undefined,
          limit: error.detail.limit as number | undefined,
          subscription: error.detail.subscription || {
            price_id: config.SUBSCRIPTION_TIERS.FREE.priceId,
            plan_name: 'Free',
          },
        });
        setIsSubmitting(false);
        return;
      }

      const isConnectionError =
        error instanceof TypeError && error.message.includes('Failed to fetch');
      if (!isLocalMode() || isConnectionError) {
        toast.error(error.message || 'An unexpected error occurred');
      }
      setIsSubmitting(false);
    }
  };

  const handleAgentChange = (value: string) => {
    if (value === 'create-new') {
      setShowAgentConfigurator(true);
    } else {
      setSelectedAgent(value);
    }
  };

  const handleAgentConfigSave = (config: {
    id?: string;
    name: string;
    systemInstructions: string;
    selectedTools: string[];
    isEdit: boolean;
  }) => {
    console.log('Agent configuration saved:', config);
    
    if (config.isEdit && config.id) {
      // Update existing agent
      toast.success(`Agent "${config.name}" updated successfully!`);
    } else {
      // Create new agent
      const newAgent = {
        id: config.name.toLowerCase().replace(/\s+/g, '-'),
        name: config.name,
        description: config.systemInstructions || 'Custom agent',
        systemInstructions: config.systemInstructions,
        selectedTools: config.selectedTools,
      };
      
      setSelectedAgent(newAgent.id);
      toast.success(`Agent "${config.name}" created successfully!`);
    }
    
    setShowAgentConfigurator(false);
  };

  const handleEditAgent = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent the select from opening
    setShowAgentConfigurator(true);
  };

  // Check for pending prompt in localStorage on mount
  useEffect(() => {
    // Use a small delay to ensure we're fully mounted
    const timer = setTimeout(() => {
      const pendingPrompt = localStorage.getItem(PENDING_PROMPT_KEY);

      if (pendingPrompt) {
        setInputValue(pendingPrompt);
        setAutoSubmit(true); // Flag to auto-submit after mounting
      }
    }, 200);

    return () => clearTimeout(timer);
  }, []);

  // Auto-submit the form if we have a pending prompt
  useEffect(() => {
    if (autoSubmit && inputValue && !isSubmitting) {
      const timer = setTimeout(() => {
        handleSubmit(inputValue);
        setAutoSubmit(false);
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [autoSubmit, inputValue, isSubmitting]);

  return (
    <div className="flex flex-col items-center justify-center h-full w-full">
      {isMobile && (
        <div className="absolute top-4 left-4 z-10">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setOpenMobile(true)}
              >
                <Menu className="h-4 w-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open menu</TooltipContent>
          </Tooltip>
        </div>
      )}

      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[650px] max-w-[90%]">
        <div className="flex flex-col items-center text-center mb-2 w-full">
          <div className="tracking-tight text-3xl font-normal text-muted-foreground/80 mt-2 flex flex-col items-center gap-1">
            <div className="flex items-center gap-2">
              <span>Hey, I am</span>
              <div className="flex items-center gap-1">
                <Select value={selectedAgent} onValueChange={handleAgentChange}>
                  <SelectTrigger className="w-auto h-auto p-0 border-none bg-transparent hover:bg-muted/50 transition-colors rounded-md px-2 py-1 inline-flex items-center gap-1">
                    <SelectValue asChild>
                      <span className="text-foreground font-semibold text-3xl underline decoration-dashed underline-offset-4 decoration-muted-foreground/40">
                        {selectedAgentData.name}
                      </span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="w-64">
                    {AGENTS.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id} className="p-3">
                        <div className="font-medium">{agent.name}</div>
                      </SelectItem>
                    ))}
                    <div className="border-t mt-1 pt-1">
                      <SelectItem value="create-new" className="text-muted-foreground">
                        + Create new agent
                      </SelectItem>
                    </div>
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 hover:bg-muted/50 transition-colors"
                  onClick={handleEditAgent}
                >
                  <Edit className="h-3 w-3 text-muted-foreground" />
                </Button>
              </div>
            </div>
            <span>What would you like me to do today?</span>
          </div>
        </div>

        <ChatInput
          ref={chatInputRef}
          onSubmit={handleSubmit}
          loading={isSubmitting}
          placeholder={`Describe what you need help with using ${selectedAgentData.name}...`}
          value={inputValue}
          onChange={setInputValue}
          hideAttachments={false}
        />
      </div>

      {/* Agent Configurator Modal */}
      <AgentConfigurator
        isOpen={showAgentConfigurator}
        onClose={() => setShowAgentConfigurator(false)}
        onSave={handleAgentConfigSave}
        availableAgents={AGENTS}
        currentAgentId={selectedAgent}
      />

      {/* Billing Error Alert */}
      <BillingErrorAlert
        message={billingError?.message}
        currentUsage={billingError?.currentUsage}
        limit={billingError?.limit}
        accountId={personalAccount?.account_id}
        onDismiss={clearBillingError}
        isOpen={!!billingError}
      />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center h-full w-full">
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[560px] max-w-[90%]">
            <div className="flex flex-col items-center text-center mb-10">
              <Skeleton className="h-10 w-40 mb-2" />
              <Skeleton className="h-7 w-56" />
            </div>

            <Skeleton className="w-full h-[100px] rounded-xl" />
            <div className="flex justify-center mt-3">
              <Skeleton className="h-5 w-16" />
            </div>
          </div>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
