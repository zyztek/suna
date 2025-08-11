'use client';

import React from 'react';
import { Download, CheckCircle, Loader2, Globe, GlobeLock, GitBranch, Trash2, MoreVertical, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { MarketplaceTemplate } from '@/components/agents/installation/types';
import { KortixLogo } from '@/components/sidebar/kortix-logo';

export type AgentCardMode = 'marketplace' | 'template' | 'agent';

interface BaseAgentData {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  created_at: string;
  avatar?: string;
  avatar_color?: string;
}

interface MarketplaceData extends BaseAgentData {
  creator_id: string;
  is_kortix_team?: boolean;
  download_count: number;
  creator_name?: string;
  marketplace_published_at?: string;
}

interface TemplateData extends BaseAgentData {
  template_id: string;
  is_public?: boolean;
  download_count?: number;
}

interface AgentData extends BaseAgentData {
  agent_id: string;
  is_default?: boolean;
  is_public?: boolean;
  marketplace_published_at?: string;
  download_count?: number;
  current_version?: {
    version_id: string;
    version_name: string;
    version_number: number;
  };
  metadata?: {
    is_suna_default?: boolean;
    centrally_managed?: boolean;
    restrictions?: {
      system_prompt_editable?: boolean;
      tools_editable?: boolean;
      name_editable?: boolean;
      description_editable?: boolean;
      mcps_editable?: boolean;
    };
  };
}

type AgentCardData = MarketplaceData | TemplateData | AgentData;

interface AgentCardProps {
  mode: AgentCardMode;
  data: AgentCardData;
  styling: {
    avatar: string;
    color: string;
  };
  isActioning?: boolean;
  onPrimaryAction?: (data: any, e?: React.MouseEvent) => void;
  onSecondaryAction?: (data: any, e?: React.MouseEvent) => void;
  onDeleteAction?: (data: any, e?: React.MouseEvent) => void;
  onClick?: (data: any) => void;
  currentUserId?: string;
}

const MarketplaceBadge: React.FC<{ 
  isKortixTeam?: boolean; 
  isOwner?: boolean;
}> = ({ isKortixTeam, isOwner }) => {
  return (
    <div className="flex gap-1 flex-wrap">
      {isKortixTeam && (
        <Badge variant="secondary" className="bg-blue-100 text-blue-700 border-0 dark:bg-blue-950 dark:text-blue-300">
          <CheckCircle className="h-3 w-3 mr-1" />
          Kortix
        </Badge>
      )}
      {isOwner && (
        <Badge variant="secondary" className="bg-green-100 text-green-700 border-0 dark:bg-green-950 dark:text-green-300">
          Owner
        </Badge>
      )}
    </div>
  );
};

const TemplateBadge: React.FC<{ isPublic?: boolean }> = ({ isPublic }) => {
  if (isPublic) {
    return (
      <Badge variant="default" className="bg-green-100 text-green-700 border-0 dark:bg-green-950 dark:text-green-300">
        <Globe className="h-3 w-3" />
        Public
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="bg-gray-100 text-gray-700 border-0 dark:bg-gray-800 dark:text-gray-300">
      <GlobeLock className="h-3 w-3" />
      Private
    </Badge>
  );
};

const AgentBadges: React.FC<{ agent: AgentData, isSunaAgent: boolean }> = ({ agent, isSunaAgent }) => (
  <div className="flex gap-1">
    {!isSunaAgent && agent.current_version && (
      <Badge variant="outline" className="text-xs">
        <GitBranch className="h-3 w-3 mr-1" />
        {agent.current_version.version_name}
      </Badge>
    )}
    {!isSunaAgent && agent.is_public && (
      <Badge variant="default" className="bg-green-100 text-green-700 border-0 dark:bg-green-950 dark:text-green-300 text-xs">
        <Globe className="h-3 w-3 mr-1" />
        Published
      </Badge>
    )}
  </div>
);

const MarketplaceMetadata: React.FC<{ data: MarketplaceData }> = ({ data }) => (
  <div className="flex items-center justify-between text-xs text-muted-foreground">
    <div className="flex items-center gap-1">
      <User className="h-3 w-3" />
      <span>{data.creator_name || 'Anonymous'}</span>
    </div>
    <div className="flex items-center gap-1">
      <Download className="h-3 w-3" />
      <span>{data.download_count} installs</span>
    </div>
  </div>
);

const TemplateMetadata: React.FC<{ data: TemplateData }> = ({ data }) => (
  <div className="space-y-1 text-xs text-muted-foreground">
    {data.is_public && data.download_count !== undefined && data.download_count > 0 && (
      <div className="flex items-center gap-1">
        <Download className="h-3 w-3" />
        <span>{data.download_count} downloads</span>
      </div>
    )}
  </div>
);

const AgentMetadata: React.FC<{ data: AgentData }> = ({ data }) => (
  <div className="space-y-1 text-xs text-muted-foreground">
    {data.is_public && data.marketplace_published_at && data.download_count && data.download_count > 0 && (
      <div className="flex items-center gap-1">
        <Download className="h-3 w-3" />
        <span>{data.download_count} downloads</span>
      </div>
    )}
  </div>
);

const MarketplaceActions: React.FC<{ 
  onAction?: (data: any, e?: React.MouseEvent) => void;
  onDeleteAction?: (data: any, e?: React.MouseEvent) => void;
  isActioning?: boolean;
  data: any;
  currentUserId?: string;
}> = ({ onAction, onDeleteAction, isActioning, data, currentUserId }) => {
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);
  const isOwner = currentUserId && data.creator_id === currentUserId;

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = () => {
    setShowDeleteDialog(false);
    onDeleteAction?.(data);
  };

  return (
    <>
      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
        <Button 
          onClick={(e) => {
            e.stopPropagation();
            onAction?.(data, e);
          }}
          disabled={isActioning}
          className="flex-1"
          size="sm"
        >
          {isActioning ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Installing...
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              Install
            </>
          )}
        </Button>
        
        {isOwner && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline" 
                size="sm"
                className="px-2"
                disabled={isActioning}
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={handleDeleteClick}
              >
                <Trash2 className="h-4 w-4" />
                Delete Template
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "<strong>{data.name}</strong>"? This will permanently remove it from the marketplace and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={(e) => e.stopPropagation()}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.stopPropagation();
                handleConfirmDelete();
              }}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              {isActioning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Template'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

const TemplateActions: React.FC<{ 
  data: TemplateData;
  onPrimaryAction?: (data: any, e?: React.MouseEvent) => void;
  onSecondaryAction?: (data: any, e?: React.MouseEvent) => void;
  isActioning?: boolean;
}> = ({ data, onPrimaryAction, onSecondaryAction, isActioning }) => (
  <div className="space-y-2">
    {data.is_public ? (
      <>
        <Button
          onClick={(e) => onPrimaryAction?.(data, e)}
          disabled={isActioning}
          variant="outline"
          className="w-full"
          size="sm"
        >
          {isActioning ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin " />
              Unpublishing...
            </>
          ) : (
            <>
              <GlobeLock className="h-3 w-3 " />
              Make Private
            </>
          )}
        </Button>
      </>
    ) : (
      <Button
        onClick={(e) => onPrimaryAction?.(data, e)}
        disabled={isActioning}
        variant="default"
        className="w-full"
        size="sm"
      >
        {isActioning ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin " />
            Publishing...
          </>
        ) : (
          <>
            <Globe className="h-3 w-3 " />
            Publish to Marketplace
          </>
        )}
      </Button>
    )}
  </div>
);

const CardAvatar: React.FC<{ avatar: string; color: string; isSunaAgent?: boolean }> = ({ avatar, color, isSunaAgent = false }) => {
  if (isSunaAgent) {
    return (
      <div className="h-14 w-14 bg-muted border flex items-center justify-center rounded-2xl">
        <KortixLogo size={28} />
      </div>
    )
  }
  return (
    <div 
      className="relative h-14 w-14 flex items-center justify-center rounded-2xl" 
      style={{ backgroundColor: color }}
    >
      <div className="text-2xl">{avatar}</div>
      {isSunaAgent && (
        <div className="absolute -top-1 -right-1 h-5 w-5 bg-background rounded-full border border-border flex items-center justify-center">
          <KortixLogo size={12} />
        </div>
      )}
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none opacity-0 dark:opacity-100 transition-opacity"
        style={{
          boxShadow: `0 16px 48px -8px ${color}70, 0 8px 24px -4px ${color}50`
        }}
      />
    </div>
  )
};

const TagList: React.FC<{ tags?: string[] }> = ({ tags }) => {
  return (
    <div className="flex flex-wrap gap-1 min-h-[1.25rem]">
      {tags && tags.length > 0 && (
        <>
          {tags.slice(0, 2).map(tag => (
            <Badge key={tag} variant="outline" className="text-xs border-border/50">
              {tag}
            </Badge>
          ))}
          {tags.length > 2 && (
            <Badge variant="outline" className="text-xs border-border/50">
              +{tags.length - 2}
            </Badge>
          )}
        </>
      )}
    </div>
  );
};

export const AgentCard: React.FC<AgentCardProps> = ({
  mode,
  data,
  styling,
  isActioning = false,
  onPrimaryAction,
  onSecondaryAction,
  onDeleteAction,
  onClick,
  currentUserId
}) => {
  const { avatar, color } = styling;
  
  const isSunaAgent = mode === 'agent' && (data as AgentData).metadata?.is_suna_default === true;
  const isOwner = currentUserId && mode === 'marketplace' && (data as MarketplaceData).creator_id === currentUserId;
  
  const cardClassName = `group relative bg-card rounded-2xl overflow-hidden shadow-sm transition-all duration-300 border cursor-pointer flex flex-col min-h-[280px] max-h-[320px] border-border/50 hover:border-primary/20`;
  
  const renderBadge = () => {
    switch (mode) {
      case 'marketplace':
        return <MarketplaceBadge 
          isKortixTeam={(data as MarketplaceData).is_kortix_team} 
          isOwner={isOwner}
        />;
      case 'template':
        return <TemplateBadge isPublic={(data as TemplateData).is_public} />;
      case 'agent':
        return <AgentBadges agent={data as AgentData} isSunaAgent={isSunaAgent} />;
      default:
        return null;
    }
  };

  const renderMetadata = () => {
    switch (mode) {
      case 'marketplace':
        return <MarketplaceMetadata data={data as MarketplaceData} />;
      case 'template':
        return <TemplateMetadata data={data as TemplateData} />;
      case 'agent':
        return <AgentMetadata data={data as AgentData} />;
      default:
        return null;
    }
  };

  const renderActions = () => {
    switch (mode) {
      case 'marketplace':
        return <MarketplaceActions 
          onAction={onPrimaryAction} 
          onDeleteAction={onDeleteAction}
          isActioning={isActioning} 
          data={data} 
          currentUserId={currentUserId}
        />;
      case 'template':
        return <TemplateActions 
          data={data as TemplateData} 
          onPrimaryAction={onPrimaryAction} 
          onSecondaryAction={onSecondaryAction} 
          isActioning={isActioning} 
        />;
      case 'agent':
        return null;
      default:
        return null;
    }
  };

  return (
    <div className={cardClassName} onClick={() => onClick?.(data)}>
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="relative p-6 flex flex-col flex-1">
        <div className="flex items-start justify-between mb-4">
          <CardAvatar avatar={avatar} color={color} isSunaAgent={isSunaAgent} />
          <div className="flex items-center gap-2">
            {renderBadge()}
          </div>
        </div>
        
        <h3 className="text-lg font-semibold text-foreground mb-2 line-clamp-1">
          {data.name}
        </h3>
        <p className="text-sm text-muted-foreground mb-4 line-clamp-2 min-h-[2.5rem]">
          {data.description || 'No description available'}
        </p>
        
        <div className="flex-1 flex flex-col">
          <div className="min-h-[1.25rem] mb-3">
            <TagList tags={data.tags} />
          </div>
          
          <div className="mt-auto">
            <div className="mb-3">
              {renderMetadata()}
            </div>
            {renderActions()}
          </div>
        </div>
      </div>
    </div>
  );
}; 