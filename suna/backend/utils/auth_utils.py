import sentry
from fastapi import HTTPException, Request, Header
from typing import Optional
import jwt
from jwt.exceptions import PyJWTError
from utils.logger import structlog
from utils.config import config
import os
from services.supabase import DBConnection
from services import redis

async def _get_user_id_from_account_cached(account_id: str) -> Optional[str]:
    """
    Get user_id from account_id with Redis caching for performance
    
    Args:
        account_id: The account ID to look up
        
    Returns:
        str: The primary owner user ID, or None if not found
    """
    cache_key = f"account_user:{account_id}"
    
    try:
        # Check Redis cache first
        redis_client = await redis.get_client()
        cached_user_id = await redis_client.get(cache_key)
        if cached_user_id:
            return cached_user_id.decode('utf-8') if isinstance(cached_user_id, bytes) else cached_user_id
    except Exception as e:
        structlog.get_logger().warning(f"Redis cache lookup failed for account {account_id}: {e}")
    
    try:
        # Fallback to database
        db = DBConnection()
        await db.initialize()
        client = await db.client
        
        user_result = await client.schema('basejump').table('accounts').select(
            'primary_owner_user_id'
        ).eq('id', account_id).limit(1).execute()
        
        if user_result.data:
            user_id = user_result.data[0]['primary_owner_user_id']
            
            # Cache the result for 5 minutes
            try:
                await redis_client.setex(cache_key, 300, user_id)
            except Exception as e:
                structlog.get_logger().warning(f"Failed to cache user lookup: {e}")
                
            return user_id
        
        return None
        
    except Exception as e:
        structlog.get_logger().error(f"Database lookup failed for account {account_id}: {e}")
        return None

# This function extracts the user ID from Supabase JWT
async def get_current_user_id_from_jwt(request: Request) -> str:
    """
    Extract and verify the user ID from the JWT in the Authorization header or API key.
    
    This function is used as a dependency in FastAPI routes to ensure the user
    is authenticated and to provide the user ID for authorization checks.
    
    Supports authentication via:
    1. X-API-Key header (public:secret key pairs from API keys table)
    2. Authorization header with Bearer token (JWT from Supabase)
    
    Args:
        request: The FastAPI request object
        
    Returns:
        str: The user ID extracted from the JWT or API key
        
    Raises:
        HTTPException: If no valid token is found or if the token is invalid
    """

    x_api_key = request.headers.get('x-api-key')

    # Check for user API keys in the database
    if x_api_key:
        try:
            # Parse the API key format: "pk_xxx:sk_xxx"
            if ':' not in x_api_key:
                raise HTTPException(
                    status_code=401,
                    detail="Invalid API key format. Expected format: pk_xxx:sk_xxx",
                    headers={"WWW-Authenticate": "Bearer"}
                )
            
            public_key, secret_key = x_api_key.split(':', 1)
            
            from services.api_keys import APIKeyService
            db = DBConnection()
            await db.initialize()
            api_key_service = APIKeyService(db)
            
            validation_result = await api_key_service.validate_api_key(public_key, secret_key)
            
            if validation_result.is_valid:
                # Get user_id from account_id with caching
                user_id = await _get_user_id_from_account_cached(str(validation_result.account_id))
                
                if user_id:
                    sentry.sentry.set_user({ "id": user_id })
                    structlog.contextvars.bind_contextvars(
                        user_id=user_id,
                        auth_method="api_key",
                        api_key_id=str(validation_result.key_id),
                        public_key=public_key
                    )
                    return user_id
                else:
                    raise HTTPException(
                        status_code=401,
                        detail="API key account not found",
                        headers={"WWW-Authenticate": "Bearer"}
                    )
            else:
                raise HTTPException(
                    status_code=401,
                    detail=f"Invalid API key: {validation_result.error_message}",
                    headers={"WWW-Authenticate": "Bearer"}
                )
        except HTTPException:
            raise
        except Exception as e:
            structlog.get_logger().error(f"Error validating API key: {e}")
            raise HTTPException(
                status_code=401,
                detail="API key validation failed",
                headers={"WWW-Authenticate": "Bearer"}
            )

    # Fall back to JWT authentication
    auth_header = request.headers.get('Authorization')
    
    if not auth_header or not auth_header.startswith('Bearer '):
        raise HTTPException(
            status_code=401,
            detail="No valid authentication credentials found",
            headers={"WWW-Authenticate": "Bearer"}
        )
    
    token = auth_header.split(' ')[1]
    
    try:
        payload = jwt.decode(token, options={"verify_signature": False})
        user_id = payload.get('sub')
        
        if not user_id:
            raise HTTPException(
                status_code=401,
                detail="Invalid token payload",
                headers={"WWW-Authenticate": "Bearer"}
            )

        sentry.sentry.set_user({ "id": user_id })
        structlog.contextvars.bind_contextvars(
            user_id=user_id,
            auth_method="jwt"
        )
        return user_id
        
    except PyJWTError:
        raise HTTPException(
            status_code=401,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"}
        )

async def get_account_id_from_thread(client, thread_id: str) -> str:
    """
    Extract and verify the account ID from the thread.
    
    Args:
        client: The Supabase client
        thread_id: The ID of the thread
        
    Returns:
        str: The account ID associated with the thread
        
    Raises:
        HTTPException: If the thread is not found or if there's an error
    """
    try:
        response = await client.table('threads').select('account_id').eq('thread_id', thread_id).execute()
        
        if not response.data or len(response.data) == 0:
            raise HTTPException(
                status_code=404,
                detail="Thread not found"
            )
        
        account_id = response.data[0].get('account_id')
        
        if not account_id:
            raise HTTPException(
                status_code=500,
                detail="Thread has no associated account"
            )
        
        return account_id
    
    except Exception as e:
        error_msg = str(e)
        if "cannot schedule new futures after shutdown" in error_msg or "connection is closed" in error_msg:
            raise HTTPException(
                status_code=503,
                detail="Server is shutting down"
            )
        else:
            raise HTTPException(
                status_code=500,
                detail=f"Error retrieving thread information: {str(e)}"
            )
    
async def get_user_id_from_stream_auth(
    request: Request,
    token: Optional[str] = None
) -> str:
    """
    Extract and verify the user ID from multiple authentication methods.
    This function is specifically designed for streaming endpoints that need to support both
    header-based and query parameter-based authentication (for EventSource compatibility).
    
    Supports authentication via:
    1. X-API-Key header (public:secret key pairs from API keys table) 
    2. Authorization header with Bearer token (JWT from Supabase)
    3. Query parameter token (JWT for EventSource compatibility)
    
    Args:
        request: The FastAPI request object
        token: Optional JWT token from query parameters
        
    Returns:
        str: The user ID extracted from the authentication method
        
    Raises:
        HTTPException: If no valid token is found or if the token is invalid
    """
    try:
        # First, try the standard authentication (handles both API keys and Authorization header)
        try:
            return await get_current_user_id_from_jwt(request)
        except HTTPException:
            # If standard auth fails, try query parameter JWT for EventSource compatibility
            pass
        
        # Try to get user_id from token in query param (for EventSource which can't set headers)
        if token:
            try:
                # For Supabase JWT, we just need to decode and extract the user ID
                payload = jwt.decode(token, options={"verify_signature": False})
                user_id = payload.get('sub')
                if user_id:
                    sentry.sentry.set_user({ "id": user_id })
                    structlog.contextvars.bind_contextvars(
                        user_id=user_id,
                        auth_method="jwt_query"
                    )
                    return user_id
            except Exception:
                pass
        
        # If we still don't have a user_id, return authentication error
        raise HTTPException(
            status_code=401,
            detail="No valid authentication credentials found",
            headers={"WWW-Authenticate": "Bearer"}
        )
    except HTTPException:
        # Re-raise HTTP exceptions as they are
        raise
    except Exception as e:
        error_msg = str(e)
        if "cannot schedule new futures after shutdown" in error_msg or "connection is closed" in error_msg:
            raise HTTPException(
                status_code=503,
                detail="Server is shutting down"
            )
        else:
            raise HTTPException(
                status_code=500,
                detail=f"Error during authentication: {str(e)}"
            )

async def verify_thread_access(client, thread_id: str, user_id: str):
    """
    Verify that a user has access to a specific thread based on account membership.
    
    Args:
        client: The Supabase client
        thread_id: The thread ID to check access for
        user_id: The user ID to check permissions for
        
    Returns:
        bool: True if the user has access
        
    Raises:
        HTTPException: If the user doesn't have access to the thread
    """
    try:
        # Query the thread to get account information
        thread_result = await client.table('threads').select('*').eq('thread_id', thread_id).execute()

        if not thread_result.data or len(thread_result.data) == 0:
            raise HTTPException(status_code=404, detail="Thread not found")
        
        thread_data = thread_result.data[0]

        if thread_data['account_id'] == user_id:
            return True
        
        # Check if project is public
        project_id = thread_data.get('project_id')
        if project_id:
            project_result = await client.table('projects').select('is_public').eq('project_id', project_id).execute()
            if project_result.data and len(project_result.data) > 0:
                if project_result.data[0].get('is_public'):
                    return True
            
        account_id = thread_data.get('account_id')
        # When using service role, we need to manually check account membership instead of using current_user_account_role
        if account_id:
            account_user_result = await client.schema('basejump').from_('account_user').select('account_role').eq('user_id', user_id).eq('account_id', account_id).execute()
            if account_user_result.data and len(account_user_result.data) > 0:
                return True
        raise HTTPException(status_code=403, detail="Not authorized to access this thread")
    except HTTPException:
        # Re-raise HTTP exceptions as they are
        raise
    except Exception as e:
        error_msg = str(e)
        if "cannot schedule new futures after shutdown" in error_msg or "connection is closed" in error_msg:
            raise HTTPException(
                status_code=503,
                detail="Server is shutting down"
            )
        else:
            raise HTTPException(
                status_code=500,
                detail=f"Error verifying thread access: {str(e)}"
            )

async def get_optional_user_id(request: Request) -> Optional[str]:
    """
    Extract the user ID from the JWT in the Authorization header if present,
    but don't require authentication. Returns None if no valid token is found.
    
    This function is used for endpoints that support both authenticated and 
    unauthenticated access (like public projects).
    
    Args:
        request: The FastAPI request object
        
    Returns:
        Optional[str]: The user ID extracted from the JWT, or None if no valid token
    """
    auth_header = request.headers.get('Authorization')
    
    if not auth_header or not auth_header.startswith('Bearer '):
        return None
    
    token = auth_header.split(' ')[1]
    
    try:
        # For Supabase JWT, we just need to decode and extract the user ID
        payload = jwt.decode(token, options={"verify_signature": False})
        
        # Supabase stores the user ID in the 'sub' claim
        user_id = payload.get('sub')
        if user_id:
            sentry.sentry.set_user({ "id": user_id })
            structlog.contextvars.bind_contextvars(
                user_id=user_id
            )
        
        return user_id
    except PyJWTError:
        return None

async def verify_admin_api_key(x_admin_api_key: Optional[str] = Header(None)):
    if not config.KORTIX_ADMIN_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="Admin API key not configured on server"
        )
    
    if not x_admin_api_key:
        raise HTTPException(
            status_code=401,
            detail="Admin API key required. Include X-Admin-Api-Key header."
        )
    
    if x_admin_api_key != config.KORTIX_ADMIN_API_KEY:
        raise HTTPException(
            status_code=403,
            detail="Invalid admin API key"
        )
    
    return True

async def verify_agent_access(client, agent_id: str, user_id: str) -> dict:
    """
    Verify that a user has access to a specific agent based on ownership.
    
    Args:
        client: The Supabase client
        agent_id: The agent ID to check access for
        user_id: The user ID to check permissions for
        
    Returns:
        dict: Agent data if access is granted
        
    Raises:
        HTTPException: If the user doesn't have access to the agent or agent doesn't exist
    """
    try:
        agent_result = await client.table('agents').select('*').eq('agent_id', agent_id).eq('account_id', user_id).execute()
        
        if not agent_result.data:
            raise HTTPException(status_code=404, detail="Agent not found or access denied")
        
        return agent_result.data[0]
        
    except HTTPException:
        raise
    except Exception as e:
        structlog.error(f"Error verifying agent access for agent {agent_id}, user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to verify agent access")
