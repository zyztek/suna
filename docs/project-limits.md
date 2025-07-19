# Project Limits Feature

This document describes the project limits feature that restricts the number of projects users can create based on their subscription tier.

## Overview

The project limits feature ensures that users on free accounts have a reasonable limit on the number of projects they can create, while paid accounts have higher limits. This helps manage system resources and encourages users to upgrade for more projects.

## Subscription Tiers and Project Limits

| Subscription Tier | Project Limit | Description |
|-------------------|---------------|-------------|
| Free | 3 projects | Basic tier for new users |
| Tier 2 ($20/month) | 10 projects | Entry-level paid tier |
| Tier 6 ($50/month) | 25 projects | Mid-tier plan |
| Tier 12 ($100/month) | 50 projects | Professional tier |
| Tier 25 ($200/month) | 100 projects | Business tier |
| Tier 50 ($400/month) | 200 projects | Enterprise tier |
| Tier 125 ($800/month) | 500 projects | Large enterprise |
| Tier 200 ($1000/month) | 1000 projects | Maximum tier |

## Implementation Details

### Backend Changes

1. **Billing Service (`backend/services/billing.py`)**:
   - Added `project_limit` field to `SUBSCRIPTION_TIERS` configuration
   - Created `check_project_limits()` function to validate project creation
   - Added `/billing/check-project-limits` API endpoint
   - Updated subscription status to include project limit information

2. **Agent API (`backend/agent/api.py`)**:
   - Added project limit check before creating projects in agent initiation
   - Returns HTTP 402 error when limits are exceeded

3. **Execution Service (`backend/triggers/services/execution_service.py`)**:
   - Added project limit checks in `create_agent_session()` and `create_workflow_session()`
   - Prevents automatic project creation when limits are reached

### Frontend Changes

1. **API Layer (`frontend/src/lib/api.ts`)**:
   - Added `checkProjectLimits()` function
   - Added `ProjectLimitsResponse` interface
   - Updated `SubscriptionStatus` interface to include project limits

2. **Project Mutations (`frontend/src/hooks/react-query/sidebar/use-project-mutations.ts`)**:
   - Added project limit check before creating projects
   - Shows error toast when limits are exceeded

3. **Billing Status Component (`frontend/src/components/billing/account-billing-status.tsx`)**:
   - Added project count display in billing status
   - Shows current projects vs. limit

4. **React Query Hook (`frontend/src/hooks/react-query/billing/use-project-limits.ts`)**:
   - Created hook for checking project limits
   - Caches results for 5 minutes

## Error Handling

When project limits are exceeded:

1. **Frontend**: Shows error toast with upgrade message
2. **Backend**: Returns HTTP 402 (Payment Required) with detailed error message
3. **API Response**: Includes current project count and limit information

## Testing

To test the feature:

1. Create projects up to your tier's limit
2. Attempt to create an additional project
3. Verify that appropriate error messages are shown
4. Check that billing status displays current project count

## Local Development

In local development mode (`ENV_MODE=LOCAL`), project limits are disabled to allow unrestricted development and testing.

## Future Enhancements

Potential improvements to consider:

1. **Soft Limits**: Allow exceeding limits with warnings
2. **Project Archiving**: Allow archiving old projects to free up slots
3. **Team Limits**: Separate limits for team accounts
4. **Usage Analytics**: Track project creation patterns
5. **Dynamic Limits**: Adjust limits based on usage patterns