import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Zap, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SubscriptionStatus } from '@/lib/api';
import { isLocalMode } from '@/lib/config';

interface TokenUsageDisplayProps {
  subscriptionData?: SubscriptionStatus | null;
  onUpgradeClick: () => void;
  showUsageDisplay?: boolean;
  className?: string;
}

export const TokenUsageDisplay: React.FC<TokenUsageDisplayProps> = ({
  subscriptionData,
  onUpgradeClick,
  showUsageDisplay = true,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Don't show in local mode
  if (isLocalMode() || !showUsageDisplay) {
    return null;
  }

  // Only show for users with limited usage (free tier or active subscriptions with limits)
  const shouldShow = subscriptionData && (
    subscriptionData.status === 'no_subscription' || 
    (subscriptionData.cost_limit && subscriptionData.cost_limit > 0)
  );

  if (!shouldShow) {
    return null;
  }

  const currentUsage = subscriptionData.current_usage || 0;
  const costLimit = subscriptionData.cost_limit || 0;
  const remaining = Math.max(0, costLimit - currentUsage);
  const usagePercentage = costLimit > 0 ? (currentUsage / costLimit) * 100 : 0;
  
  const isNearLimit = usagePercentage > 80;
  const isAtLimit = remaining <= 0;

  const getStatusColor = () => {
    if (isAtLimit) return 'text-red-500';
    if (isNearLimit) return 'text-amber-500';
    return 'text-muted-foreground';
  };

  const getProgressColor = () => {
    if (isAtLimit) return 'bg-red-500';
    if (isNearLimit) return 'bg-amber-500';
    return 'bg-primary';
  };

  return (
    <div className={cn(
      'absolute -top-12 left-0 right-0 bg-background/95 backdrop-blur-sm border border-border/50 rounded-lg shadow-sm transition-all duration-200',
      className
    )}>
      {/* Compact Display */}
      <div 
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Zap className={cn('w-3.5 h-3.5', getStatusColor())} />
          <span className={cn('text-sm font-medium', getStatusColor())}>
            ${remaining.toFixed(2)} left
          </span>
          {subscriptionData.status === 'no_subscription' && (
            <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted/50 rounded-full">
              Free
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onUpgradeClick();
            }}
            className="h-6 px-2 text-xs hover:bg-primary/10 hover:text-primary"
          >
            <CreditCard className="w-3 h-3 mr-1" />
            Upgrade
          </Button>
          
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-3 pb-3 border-t border-border/50">
          <div className="pt-2 space-y-2">
            {/* Usage Bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Monthly Usage</span>
                <span>{usagePercentage.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-muted/50 rounded-full h-1.5">
                <div 
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-300',
                    getProgressColor()
                  )}
                  style={{ width: `${Math.min(100, usagePercentage)}%` }}
                />
              </div>
            </div>

            {/* Detailed Stats */}
            <div className="flex justify-between items-center text-xs">
              <span className="text-muted-foreground">
                Used: ${currentUsage.toFixed(2)} / ${costLimit.toFixed(2)}
              </span>
              <span className={cn('font-medium', getStatusColor())}>
                {subscriptionData.plan_name || 'Free Plan'}
              </span>
            </div>
            
            {isAtLimit && (
              <div className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded">
                ⚠️ Monthly limit reached. Upgrade to continue using Suna.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};