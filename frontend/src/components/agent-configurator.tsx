'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Tool {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
}

interface Agent {
  id: string;
  name: string;
  description: string;
  systemInstructions?: string;
  selectedTools?: string[];
}

const AVAILABLE_TOOLS: Tool[] = [
  {
    id: 'llm',
    name: 'LLM',
    description: 'Advanced language model capabilities',
    category: 'AI',
    icon: '🔮',
  },
  {
    id: 'python-code',
    name: 'Python Code',
    description: 'Execute Python code and scripts',
    category: 'Code',
    icon: '🐍',
  },
  {
    id: 'javascript-code',
    name: 'JavaScript Code',
    description: 'Execute JavaScript code',
    category: 'Code',
    icon: '📜',
  },
  {
    id: 'api',
    name: 'API',
    description: 'Make HTTP requests to external APIs',
    category: 'Integration',
    icon: '🔗',
  },
  {
    id: 'google-search',
    name: 'Google Search',
    description: 'Search the web using Google',
    category: 'Search',
    icon: '🔍',
  },
  {
    id: 'file-handler',
    name: 'File Handler',
    description: 'Read, write, and process files',
    category: 'File',
    icon: '📁',
  },
  {
    id: 'data-scraper',
    name: 'Data Scraper',
    description: 'Extract data from websites',
    category: 'Data',
    icon: '🕷️',
  },
  {
    id: 'email',
    name: 'Email',
    description: 'Send and manage emails',
    category: 'Communication',
    icon: '📧',
  },
];

const CATEGORIES = ['All', 'AI', 'Code', 'Integration', 'Search', 'File', 'Data', 'Communication'];

interface AgentConfiguratorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: {
    id?: string;
    name: string;
    systemInstructions: string;
    selectedTools: string[];
    isEdit: boolean;
  }) => void;
  availableAgents: Agent[];
  currentAgentId?: string;
}

export function AgentConfigurator({ 
  isOpen, 
  onClose, 
  onSave, 
  availableAgents,
  currentAgentId 
}: AgentConfiguratorProps) {
  const [selectedAgentId, setSelectedAgentId] = useState<string>('create-new');
  const [agentName, setAgentName] = useState('');
  const [systemInstructions, setSystemInstructions] = useState('');
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [originalData, setOriginalData] = useState<{
    name: string;
    systemInstructions: string;
    selectedTools: string[];
  } | null>(null);

  const isEditing = selectedAgentId !== 'create-new';
  const currentAgent = availableAgents.find(agent => agent.id === selectedAgentId);

  // Load agent data when selection changes
  useEffect(() => {
    if (selectedAgentId === 'create-new') {
      const newData = { name: '', systemInstructions: '', selectedTools: [] };
      setAgentName(newData.name);
      setSystemInstructions(newData.systemInstructions);
      setSelectedTools(newData.selectedTools);
      setOriginalData(newData);
    } else {
      const agent = availableAgents.find(a => a.id === selectedAgentId);
      if (agent) {
        const agentData = {
          name: agent.name,
          systemInstructions: agent.systemInstructions || agent.description,
          selectedTools: agent.selectedTools || [],
        };
        setAgentName(agentData.name);
        setSystemInstructions(agentData.systemInstructions);
        setSelectedTools(agentData.selectedTools);
        setOriginalData(agentData);
      }
    }
    setHasChanges(false);
  }, [selectedAgentId, availableAgents]);

  // Set initial agent when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedAgentId(currentAgentId || 'create-new');
    }
  }, [isOpen, currentAgentId]);

  // Track changes
  useEffect(() => {
    if (originalData) {
      const hasDataChanges = 
        agentName !== originalData.name ||
        systemInstructions !== originalData.systemInstructions ||
        JSON.stringify(selectedTools.sort()) !== JSON.stringify(originalData.selectedTools.sort());
      setHasChanges(hasDataChanges);
    }
  }, [agentName, systemInstructions, selectedTools, originalData]);

  const filteredTools = AVAILABLE_TOOLS.filter(tool => {
    const matchesCategory = selectedCategory === 'All' || tool.category === selectedCategory;
    const matchesSearch = tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         tool.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleToolToggle = (toolId: string) => {
    setSelectedTools(prev =>
      prev.includes(toolId)
        ? prev.filter(id => id !== toolId)
        : [...prev, toolId]
    );
  };

  const handleSave = () => {
    if (!agentName.trim()) return;
    
    console.log('Saving agent configuration:', {
      id: isEditing ? selectedAgentId : undefined,
      name: agentName,
      systemInstructions,
      selectedTools,
      isEdit: isEditing,
    });
    
    onSave({
      id: isEditing ? selectedAgentId : undefined,
      name: agentName,
      systemInstructions,
      selectedTools,
      isEdit: isEditing,
    });
    
    setHasChanges(false);
  };

  const handleDiscard = () => {
    if (originalData) {
      setAgentName(originalData.name);
      setSystemInstructions(originalData.systemInstructions);
      setSelectedTools(originalData.selectedTools);
      setHasChanges(false);
    }
  };

  const handleClose = () => {
    // Reset everything when closing
    setSelectedAgentId('create-new');
    setAgentName('');
    setSystemInstructions('');
    setSelectedTools([]);
    setSearchQuery('');
    setSelectedCategory('All');
    setHasChanges(false);
    setOriginalData(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] p-0 gap-0 bg-white border border-gray-200">
        {/* Header */}
        <div className="border-b border-gray-100 px-8 py-6">
          <DialogTitle className="text-xl font-medium text-gray-900 mb-1">
            {isEditing ? 'Edit Agent' : 'Create Agent'}
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-600">
            {isEditing 
              ? 'Modify your agent configuration and tools'
              : 'Configure your custom agent with specific tools and instructions'
            }
          </DialogDescription>
        </div>

        {/* Content */}
        <div className="flex h-[600px]">
          {/* Left Panel - Configuration */}
          <div className="w-2/5 border-r border-gray-100 flex flex-col">
            <div className="p-8 flex-1 flex flex-col gap-6">
              {/* Agent Selection */}
              <div className="space-y-3">
                <Label className="text-sm font-medium text-gray-900">Agent</Label>
                <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                  <SelectTrigger className="h-10 border-gray-200 focus:border-gray-900 transition-colors">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-gray-200">
                    <SelectItem value="create-new" className="py-2.5">
                      <span className="text-gray-600">+ Create New Agent</span>
                    </SelectItem>
                    {availableAgents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id} className="py-2.5">
                        <span className="font-medium">{agent.name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Agent Name */}
              <div className="space-y-3">
                <Label htmlFor="agent-name" className="text-sm font-medium text-gray-900">
                  Name
                </Label>
                <Input
                  id="agent-name"
                  placeholder="e.g., Research Assistant"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  className="h-10 border-gray-200 focus:border-gray-900 transition-colors"
                />
              </div>

              {/* System Instructions */}
              <div className="space-y-3 flex-1 flex flex-col">
                <Label htmlFor="system-instructions" className="text-sm font-medium text-gray-900">
                  Instructions
                </Label>
                <Textarea
                  id="system-instructions"
                  placeholder="Describe the agent's role, behavior, and expertise..."
                  value={systemInstructions}
                  onChange={(e) => setSystemInstructions(e.target.value)}
                  className="flex-1 min-h-0 border-gray-200 focus:border-gray-900 transition-colors resize-none"
                />
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="border-t border-gray-100 p-6">
              <div className="flex gap-3">
                <Button 
                  onClick={handleSave} 
                  disabled={!agentName.trim() || !hasChanges}
                  className="flex-1 h-10 bg-black hover:bg-gray-800 text-white border-0"
                >
                  {isEditing ? 'Save Changes' : 'Create Agent'}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={hasChanges ? handleDiscard : handleClose}
                  className="h-10 border-gray-200 hover:bg-gray-50 text-gray-700"
                >
                  {hasChanges ? 'Discard' : 'Cancel'}
                </Button>
              </div>
              
              {hasChanges && (
                <p className="text-xs text-gray-500 text-center mt-3">
                  You have unsaved changes
                </p>
              )}
            </div>
          </div>

          {/* Right Panel - Tools */}
          <div className="flex-1 flex flex-col">
            {/* Tools Header */}
            <div className="p-8 pb-6 border-b border-gray-100">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-medium text-gray-900">Tools</h3>
                <span className="text-sm text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                  {selectedTools.length} selected
                </span>
              </div>

              {/* Search */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search tools..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-10 border-gray-200 focus:border-gray-900 transition-colors"
                />
              </div>

              {/* Categories */}
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((category) => (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                      selectedCategory === category
                        ? "bg-gray-900 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    )}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>

            {/* Tools List */}
            <div className="flex-1 overflow-y-auto px-8 py-4">
              <div className="space-y-2">
                {filteredTools.map((tool) => (
                  <div
                    key={tool.id}
                    onClick={() => handleToolToggle(tool.id)}
                    className={cn(
                      "group flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-all",
                      selectedTools.includes(tool.id)
                        ? "border-gray-900 bg-gray-50"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    )}
                  >
                    <div className={cn(
                      "flex items-center justify-center w-5 h-5 rounded border-2 transition-colors",
                      selectedTools.includes(tool.id)
                        ? "border-gray-900 bg-gray-900"
                        : "border-gray-300 group-hover:border-gray-400"
                    )}>
                      {selectedTools.includes(tool.id) && (
                        <Check className="h-3 w-3 text-white" />
                      )}
                    </div>
                    
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="text-lg flex-shrink-0">{tool.icon}</span>
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 truncate">{tool.name}</div>
                        <div className="text-sm text-gray-500 truncate">{tool.description}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 