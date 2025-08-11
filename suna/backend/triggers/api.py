from fastapi import APIRouter, HTTPException, Depends, Request, Body, Query
from fastapi.responses import JSONResponse
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
import os
import uuid
from datetime import datetime, timezone
import json
import hmac

from services.supabase import DBConnection
from utils.auth_utils import get_current_user_id_from_jwt
from utils.logger import logger
from flags.flags import is_enabled
from utils.config import config
from services.billing import check_billing_status, can_use_model

from .trigger_service import get_trigger_service, TriggerType
from .provider_service import get_provider_service
from .execution_service import get_execution_service
from .utils import get_next_run_time, get_human_readable_schedule


# ===== ROUTERS =====

router = APIRouter(prefix="/triggers", tags=["triggers"])
workflows_router = APIRouter(prefix="/workflows", tags=["workflows"])

# Global database connection
db: Optional[DBConnection] = None


# ===== REQUEST/RESPONSE MODELS =====

class TriggerCreateRequest(BaseModel):
    provider_id: str
    name: str
    config: Dict[str, Any]
    description: Optional[str] = None


class TriggerUpdateRequest(BaseModel):
    config: Optional[Dict[str, Any]] = None
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class TriggerResponse(BaseModel):
    trigger_id: str
    agent_id: str
    trigger_type: str
    provider_id: str
    name: str
    description: Optional[str]
    is_active: bool
    webhook_url: Optional[str]
    created_at: str
    updated_at: str
    config: Dict[str, Any]


class ProviderResponse(BaseModel):
    provider_id: str
    name: str
    description: str
    trigger_type: str
    webhook_enabled: bool
    config_schema: Dict[str, Any]


class UpcomingRun(BaseModel):
    trigger_id: str
    trigger_name: str
    trigger_type: str
    next_run_time: str
    next_run_time_local: str
    timezone: str
    cron_expression: str
    execution_type: str
    agent_prompt: Optional[str] = None
    workflow_id: Optional[str] = None
    is_active: bool
    human_readable: str


class UpcomingRunsResponse(BaseModel):
    upcoming_runs: List[UpcomingRun]
    total_count: int


# Workflow models
class WorkflowStepRequest(BaseModel):
    id: Optional[str] = None  # CRITICAL: Accept ID from frontend
    name: str
    description: Optional[str] = None
    type: Optional[str] = "instruction"
    config: Dict[str, Any] = {}
    conditions: Optional[Dict[str, Any]] = None
    order: int
    parentConditionalId: Optional[str] = None  # CRITICAL: Accept parentConditionalId
    children: Optional[List['WorkflowStepRequest']] = None


class WorkflowCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None
    trigger_phrase: Optional[str] = None
    is_default: bool = False
    steps: List[WorkflowStepRequest] = []


class WorkflowUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    trigger_phrase: Optional[str] = None
    is_default: Optional[bool] = None
    status: Optional[str] = None
    steps: Optional[List[WorkflowStepRequest]] = None


class WorkflowExecuteRequest(BaseModel):
    input_data: Optional[Dict[str, Any]] = None


# Rebuild models to handle forward references
WorkflowStepRequest.model_rebuild()


# ===== INITIALIZATION =====

def initialize(database: DBConnection):
    """Initialize the triggers module with database connection"""
    global db
    db = database


async def verify_agent_access(agent_id: str, user_id: str):
    """Verify user has access to the agent"""
    client = await db.client
    result = await client.table('agents').select('agent_id').eq('agent_id', agent_id).eq('account_id', user_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Agent not found or access denied")


# ===== PROVIDER ENDPOINTS =====

@router.get("/providers")
async def get_providers():
    """Get available trigger providers"""
    if not await is_enabled("agent_triggers"):
        raise HTTPException(status_code=403, detail="Agent triggers are not enabled")
    
    try:
        provider_service = get_provider_service(db)
        providers = await provider_service.get_available_providers()
        
        return [ProviderResponse(**provider) for provider in providers]
        
    except Exception as e:
        logger.error(f"Error getting providers: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/agents/{agent_id}/triggers", response_model=List[TriggerResponse])
async def get_agent_triggers(
    agent_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    if not await is_enabled("agent_triggers"):
        raise HTTPException(status_code=403, detail="Agent triggers are not enabled")
    
    await verify_agent_access(agent_id, user_id)
    
    try:
        trigger_service = get_trigger_service(db)
        triggers = await trigger_service.get_agent_triggers(agent_id)
        
        base_url = os.getenv("WEBHOOK_BASE_URL", "http://localhost:8000")
        
        responses = []
        for trigger in triggers:
            webhook_url = f"{base_url}/api/triggers/{trigger.trigger_id}/webhook"
            
            responses.append(TriggerResponse(
                trigger_id=trigger.trigger_id,
                agent_id=trigger.agent_id,
                trigger_type=trigger.trigger_type.value,
                provider_id=trigger.provider_id,
                name=trigger.name,
                description=trigger.description,
                is_active=trigger.is_active,
                webhook_url=webhook_url,
                created_at=trigger.created_at.isoformat(),
                updated_at=trigger.updated_at.isoformat(),
                config=trigger.config
            ))
        
        return responses
        
    except Exception as e:
        logger.error(f"Error getting agent triggers: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/agents/{agent_id}/upcoming-runs", response_model=UpcomingRunsResponse)
async def get_agent_upcoming_runs(
    agent_id: str,
    limit: int = Query(10, ge=1, le=50),
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """Get upcoming scheduled runs for agent triggers"""
    if not await is_enabled("agent_triggers"):
        raise HTTPException(status_code=403, detail="Agent triggers are not enabled")
    
    await verify_agent_access(agent_id, user_id)
    
    try:
        trigger_service = get_trigger_service(db)
        triggers = await trigger_service.get_agent_triggers(agent_id)
        
        # Filter for active schedule triggers
        schedule_triggers = [
            trigger for trigger in triggers 
            if trigger.is_active and trigger.trigger_type == TriggerType.SCHEDULE
        ]
        
        upcoming_runs = []
        for trigger in schedule_triggers:
            config = trigger.config
            cron_expression = config.get('cron_expression')
            user_timezone = config.get('timezone', 'UTC')
            
            if not cron_expression:
                continue
                
            try:
                next_run = get_next_run_time(cron_expression, user_timezone)
                if not next_run:
                    continue
                
                import pytz
                local_tz = pytz.timezone(user_timezone)
                next_run_local = next_run.astimezone(local_tz)
                
                human_readable = get_human_readable_schedule(cron_expression, user_timezone)
                
                upcoming_runs.append(UpcomingRun(
                    trigger_id=trigger.trigger_id,
                    trigger_name=trigger.name,
                    trigger_type=trigger.trigger_type.value,
                    next_run_time=next_run.isoformat(),
                    next_run_time_local=next_run_local.isoformat(),
                    timezone=user_timezone,
                    cron_expression=cron_expression,
                    execution_type=config.get('execution_type', 'agent'),
                    agent_prompt=config.get('agent_prompt'),
                    workflow_id=config.get('workflow_id'),
                    is_active=trigger.is_active,
                    human_readable=human_readable
                ))
                
            except Exception as e:
                logger.warning(f"Error calculating next run for trigger {trigger.trigger_id}: {e}")
                continue
        
        upcoming_runs.sort(key=lambda x: x.next_run_time)
        upcoming_runs = upcoming_runs[:limit]
        
        return UpcomingRunsResponse(
            upcoming_runs=upcoming_runs,
            total_count=len(upcoming_runs)
        )
        
    except Exception as e:
        logger.error(f"Error getting upcoming runs: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/agents/{agent_id}/triggers", response_model=TriggerResponse)
async def create_agent_trigger(
    agent_id: str,
    request: TriggerCreateRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """Create a new trigger for an agent"""
    if not await is_enabled("agent_triggers"):
        raise HTTPException(status_code=403, detail="Agent triggers are not enabled")
        
    await verify_agent_access(agent_id, user_id)
    
    try:
        trigger_service = get_trigger_service(db)
        
        trigger = await trigger_service.create_trigger(
            agent_id=agent_id,
            provider_id=request.provider_id,
            name=request.name,
            config=request.config,
            description=request.description
        )
        
        base_url = os.getenv("WEBHOOK_BASE_URL", "http://localhost:8000")
        webhook_url = f"{base_url}/api/triggers/{trigger.trigger_id}/webhook"
        
        return TriggerResponse(
            trigger_id=trigger.trigger_id,
            agent_id=trigger.agent_id,
            trigger_type=trigger.trigger_type.value,
            provider_id=trigger.provider_id,
            name=trigger.name,
            description=trigger.description,
            is_active=trigger.is_active,
            webhook_url=webhook_url,
            created_at=trigger.created_at.isoformat(),
            updated_at=trigger.updated_at.isoformat(),
            config=trigger.config
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating trigger: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/{trigger_id}", response_model=TriggerResponse)
async def get_trigger(
    trigger_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """Get a trigger by ID"""
    if not await is_enabled("agent_triggers"):
        raise HTTPException(status_code=403, detail="Agent triggers are not enabled")
    
    try:
        trigger_service = get_trigger_service(db)
        trigger = await trigger_service.get_trigger(trigger_id)
        
        if not trigger:
            raise HTTPException(status_code=404, detail="Trigger not found")
        
        await verify_agent_access(trigger.agent_id, user_id)
        
        base_url = os.getenv("WEBHOOK_BASE_URL", "http://localhost:8000")
        webhook_url = f"{base_url}/api/triggers/{trigger_id}/webhook"
        
        return TriggerResponse(
            trigger_id=trigger.trigger_id,
            agent_id=trigger.agent_id,
            trigger_type=trigger.trigger_type.value,
            provider_id=trigger.provider_id,
            name=trigger.name,
            description=trigger.description,
            is_active=trigger.is_active,
            webhook_url=webhook_url,
            created_at=trigger.created_at.isoformat(),
            updated_at=trigger.updated_at.isoformat(),
            config=trigger.config
        )
        
    except Exception as e:
        logger.error(f"Error getting trigger: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.put("/{trigger_id}", response_model=TriggerResponse)
async def update_trigger(
    trigger_id: str,
    request: TriggerUpdateRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """Update a trigger"""
    if not await is_enabled("agent_triggers"):
        raise HTTPException(status_code=403, detail="Agent triggers are not enabled")
    
    try:
        trigger_service = get_trigger_service(db)
        
        trigger = await trigger_service.get_trigger(trigger_id)
        if not trigger:
            raise HTTPException(status_code=404, detail="Trigger not found")

        await verify_agent_access(trigger.agent_id, user_id)
        
        updated_trigger = await trigger_service.update_trigger(
            trigger_id=trigger_id,
            config=request.config,
            name=request.name,
            description=request.description,
            is_active=request.is_active
        )
        
        base_url = os.getenv("WEBHOOK_BASE_URL", "http://localhost:8000")
        webhook_url = f"{base_url}/api/triggers/{trigger_id}/webhook"

        return TriggerResponse(
            trigger_id=updated_trigger.trigger_id,
            agent_id=updated_trigger.agent_id,
            trigger_type=updated_trigger.trigger_type.value,
            provider_id=updated_trigger.provider_id,
            name=updated_trigger.name,
            description=updated_trigger.description,
            is_active=updated_trigger.is_active,
            webhook_url=webhook_url,
            created_at=updated_trigger.created_at.isoformat(),
            updated_at=updated_trigger.updated_at.isoformat(),
            config=updated_trigger.config
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating trigger: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.delete("/{trigger_id}")
async def delete_trigger(
    trigger_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """Delete a trigger"""
    if not await is_enabled("agent_triggers"):
        raise HTTPException(status_code=403, detail="Agent triggers are not enabled")
    
    try:
        trigger_service = get_trigger_service(db)
        trigger = await trigger_service.get_trigger(trigger_id)
        if not trigger:
            raise HTTPException(status_code=404, detail="Trigger not found")

        await verify_agent_access(trigger.agent_id, user_id)
        
        success = await trigger_service.delete_trigger(trigger_id)
        if not success:
            raise HTTPException(status_code=404, detail="Trigger not found")
        
        return {"message": "Trigger deleted successfully"}
        
    except Exception as e:
        logger.error(f"Error deleting trigger: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/{trigger_id}/webhook")
async def trigger_webhook(
    trigger_id: str,
    request: Request
):
    """Handle incoming webhook for a trigger"""
    if not await is_enabled("agent_triggers"):
        raise HTTPException(status_code=403, detail="Agent triggers are not enabled")
    
    try:
        # Simple header-based auth using a shared secret
        # Configure the secret via environment variable: TRIGGER_WEBHOOK_SECRET
        secret = os.getenv("TRIGGER_WEBHOOK_SECRET")
        if not secret:
            logger.error("TRIGGER_WEBHOOK_SECRET is not configured")
            raise HTTPException(status_code=500, detail="Webhook secret not configured")

        incoming_secret = request.headers.get("x-trigger-secret", "")
        if not hmac.compare_digest(incoming_secret, secret):
            logger.warning(f"Invalid webhook secret for trigger {trigger_id}")
            raise HTTPException(status_code=401, detail="Unauthorized")

        # Get raw data from request
        raw_data = {}
        try:
            raw_data = await request.json()
        except:
            pass
        
        # Process trigger event
        trigger_service = get_trigger_service(db)
        result = await trigger_service.process_trigger_event(trigger_id, raw_data)
        
        if not result.success:
            return JSONResponse(
                status_code=400,
                content={"success": False, "error": result.error_message}
            )
        
        # Execute if needed
        if result.should_execute_agent or result.should_execute_workflow:
            trigger = await trigger_service.get_trigger(trigger_id)
            if trigger:
                logger.info(f"Executing agent {trigger.agent_id} for trigger {trigger_id}")
                
                from .trigger_service import TriggerEvent
                event = TriggerEvent(
                    trigger_id=trigger_id,
                    agent_id=trigger.agent_id,
                    trigger_type=trigger.trigger_type,
                    raw_data=raw_data
                )
                
                execution_service = get_execution_service(db)
                execution_result = await execution_service.execute_trigger_result(
                    agent_id=trigger.agent_id,
                    trigger_result=result,
                    trigger_event=event
                )
                
                logger.info(f"Agent execution result: {execution_result}")
                
                return JSONResponse(content={
                    "success": True,
                    "message": "Trigger processed and agent execution started",
                    "execution": execution_result,
                    "trigger_result": {
                        "should_execute_agent": result.should_execute_agent,
                        "should_execute_workflow": result.should_execute_workflow,
                        "agent_prompt": result.agent_prompt
                    }
                })
            else:
                logger.warning(f"Trigger {trigger_id} not found for execution")
        
        logger.info(f"Webhook processed but no execution needed")
        return JSONResponse(content={
            "success": True,
            "message": "Trigger processed successfully (no execution needed)",
            "trigger_result": {
                "should_execute_agent": result.should_execute_agent,
                "should_execute_workflow": result.should_execute_workflow
            }
        })
        
    except Exception as e:
        logger.error(f"Error processing webhook trigger: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": "Internal server error"}
        )


# ===== WORKFLOW ENDPOINTS =====

def convert_steps_to_json(steps: List[WorkflowStepRequest]) -> List[Dict[str, Any]]:
    """Convert workflow steps to JSON format"""
    if not steps:
        return []
    
    result = []
    for step in steps:
        step_dict = {
            'name': step.name,
            'description': step.description,
            'type': step.type or 'instruction',
            'config': step.config,
            'conditions': step.conditions,
            'order': step.order
        }
        
        # CRITICAL: Preserve ID and parentConditionalId if they exist
        if hasattr(step, 'id') and step.id:
            step_dict['id'] = step.id
        if hasattr(step, 'parentConditionalId') and step.parentConditionalId:
            step_dict['parentConditionalId'] = step.parentConditionalId
            
        if step.children:
            step_dict['children'] = convert_steps_to_json(step.children)
        result.append(step_dict)
    return result


@workflows_router.get("/agents/{agent_id}/workflows")
async def get_agent_workflows(
    agent_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """Get workflows for an agent"""
    await verify_agent_access(agent_id, user_id)
    
    client = await db.client
    result = await client.table('agent_workflows').select('*').eq('agent_id', agent_id).order('created_at', desc=True).execute()
    
    return result.data


@workflows_router.post("/agents/{agent_id}/workflows")
async def create_agent_workflow(
    agent_id: str,
    workflow_data: WorkflowCreateRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """Create a new workflow for an agent"""
    await verify_agent_access(agent_id, user_id)
    
    try:
        client = await db.client
        steps_json = convert_steps_to_json(workflow_data.steps)
        
        result = await client.table('agent_workflows').insert({
            'agent_id': agent_id,
            'name': workflow_data.name,
            'description': workflow_data.description,
            'trigger_phrase': workflow_data.trigger_phrase,
            'is_default': workflow_data.is_default,
            'status': 'draft',
            'steps': steps_json
        }).execute()
        
        return result.data[0]
        
    except Exception as e:
        logger.error(f"Error creating workflow: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to create workflow: {str(e)}")


@workflows_router.put("/agents/{agent_id}/workflows/{workflow_id}")
async def update_agent_workflow(
    agent_id: str,
    workflow_id: str,
    workflow_data: WorkflowUpdateRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """Update a workflow"""
    await verify_agent_access(agent_id, user_id)
    
    client = await db.client
    
    # Verify workflow exists
    workflow_result = await client.table('agent_workflows').select('*').eq('id', workflow_id).eq('agent_id', agent_id).execute()
    if not workflow_result.data:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    # Build update data
    update_data = {}
    if workflow_data.name is not None:
        update_data['name'] = workflow_data.name
    if workflow_data.description is not None:
        update_data['description'] = workflow_data.description
    if workflow_data.trigger_phrase is not None:
        update_data['trigger_phrase'] = workflow_data.trigger_phrase
    if workflow_data.is_default is not None:
        update_data['is_default'] = workflow_data.is_default
    if workflow_data.status is not None:
        update_data['status'] = workflow_data.status
    if workflow_data.steps is not None:
        update_data['steps'] = convert_steps_to_json(workflow_data.steps)
    
    if update_data:
        await client.table('agent_workflows').update(update_data).eq('id', workflow_id).execute()
    
    # Return updated workflow
    updated_result = await client.table('agent_workflows').select('*').eq('id', workflow_id).execute()
    return updated_result.data[0]


@workflows_router.delete("/agents/{agent_id}/workflows/{workflow_id}")
async def delete_agent_workflow(
    agent_id: str,
    workflow_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """Delete a workflow"""
    await verify_agent_access(agent_id, user_id)
    
    client = await db.client
    
    # Verify workflow exists
    workflow_result = await client.table('agent_workflows').select('*').eq('id', workflow_id).eq('agent_id', agent_id).execute()
    if not workflow_result.data:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    await client.table('agent_workflows').delete().eq('id', workflow_id).execute()
    return {"message": "Workflow deleted successfully"}


@workflows_router.post("/agents/{agent_id}/workflows/{workflow_id}/execute")
async def execute_agent_workflow(
    agent_id: str,
    workflow_id: str,
    execution_data: WorkflowExecuteRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """Manually execute a workflow"""
    await verify_agent_access(agent_id, user_id)
    
    client = await db.client
    
    # Get workflow
    workflow_result = await client.table('agent_workflows').select('*').eq('id', workflow_id).eq('agent_id', agent_id).execute()
    if not workflow_result.data:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    workflow = workflow_result.data[0]
    if workflow['status'] != 'active':
        raise HTTPException(status_code=400, detail="Workflow is not active")
    
    # Get agent info
    agent_result = await client.table('agents').select('account_id, name').eq('agent_id', agent_id).execute()
    if not agent_result.data:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    account_id = agent_result.data[0]['account_id']
    
    from agent.versioning.version_service import get_version_service
    version_service = await get_version_service()
    active_version = await version_service.get_active_version(agent_id, "system")
    
    if active_version and active_version.model:
        model_name = active_version.model
    else:
        model_name = config.MODEL_TO_USE or "anthropic/claude-sonnet-4-20250514"
    
    can_use, model_message, allowed_models = await can_use_model(client, account_id, model_name)
    if not can_use:
        raise HTTPException(status_code=403, detail={"message": model_message, "allowed_models": allowed_models})

    can_run, message, subscription = await check_billing_status(client, account_id)
    if not can_run:
        raise HTTPException(status_code=402, detail={"message": message, "subscription": subscription})
    
    from .trigger_service import TriggerResult, TriggerEvent, TriggerType
    
    trigger_result = TriggerResult(
        success=True,
        should_execute_workflow=True,
        workflow_id=workflow_id,
        workflow_input=execution_data.input_data or {},
        execution_variables={
            'triggered_by': 'manual',
            'execution_timestamp': datetime.now(timezone.utc).isoformat(),
            'user_id': user_id,
            'execution_source': 'workflow_api'
        }
    )
    
    trigger_event = TriggerEvent(
        trigger_id=f"manual_{workflow_id}_{uuid.uuid4()}",
        agent_id=agent_id,
        trigger_type=TriggerType.WEBHOOK,
        raw_data=execution_data.input_data or {}
    )
    
    # Execute workflow
    execution_service = get_execution_service(db)
    execution_result = await execution_service.execute_trigger_result(
        agent_id=agent_id,
        trigger_result=trigger_result,
        trigger_event=trigger_event
    )
    
    if execution_result["success"]:
        logger.info(f"Manual workflow execution started: {execution_result}")
        return {
            "thread_id": execution_result.get("thread_id"),
            "agent_run_id": execution_result.get("agent_run_id"),
            "status": "running",
            "message": f"Workflow '{workflow['name']}' execution started"
        }
    else:
        logger.error(f"Manual workflow execution failed: {execution_result}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Failed to start workflow execution",
                "details": execution_result.get("error", "Unknown error")
            }
        )


# ===== INCLUDE WORKFLOWS ROUTER =====

router.include_router(workflows_router)
