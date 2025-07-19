# Enhanced Error Handling System

This document describes the comprehensive error handling system that extends the existing `AnthropicException - Overloaded` handling to cover various LLM provider errors and automatically suggest appropriate fallback strategies.

## Overview

The error handling system automatically detects specific error types from different LLM providers and suggests appropriate fallback models to ensure continued service availability. This system is implemented in both the `thread_manager.py` and `response_processor.py` files.

## Core Function

### `detect_error_and_suggest_fallback(error: Exception, current_model: str) -> tuple[bool, str, str]`

This function analyzes an exception and the current model being used to determine if a fallback should be attempted and what the fallback model should be.

**Parameters:**
- `error`: The exception that occurred
- `current_model`: The current model being used

**Returns:**
- `should_fallback`: Boolean indicating whether to attempt a fallback
- `fallback_model`: The suggested fallback model (empty string if no fallback)
- `error_type`: The type of error detected for logging purposes

## Supported Error Types

### 1. Anthropic-Specific Errors

**Error Pattern:** `"AnthropicException - Overloaded"`
- **Fallback Strategy:** Switch to OpenRouter version of the same model
- **Example:** `anthropic/claude-3-sonnet` → `openrouter/anthropic/claude-3-sonnet`
- **Note:** If already using OpenRouter, no fallback is suggested

### 2. OpenRouter-Specific Errors

**Connection/Timeout Errors:**
- **Error Patterns:** `"connection"`, `"timeout"`
- **Fallback Strategy:** Switch to a different OpenRouter model of the same family
- **Examples:**
  - `openrouter/anthropic/claude-3-sonnet` → `openrouter/anthropic/claude-sonnet-4`
  - `openrouter/openai/gpt-4o` → `openrouter/openai/gpt-4o` (same model, different provider)
  - `openrouter/x-ai/grok-4` → `openrouter/x-ai/grok-4` (same model, different provider)

**Rate Limit Errors:**
- **Error Patterns:** `"rate limit"`, `"quota"`
- **Fallback Strategy:** Switch to a different OpenRouter model with potentially different rate limits
- **Examples:**
  - `openrouter/anthropic/claude-3-sonnet` → `openrouter/anthropic/claude-3-5-sonnet`
  - `openrouter/openai/gpt-4o` → `openrouter/openai/gpt-4-turbo`

### 3. OpenAI-Specific Errors

**Rate Limit Errors:**
- **Error Patterns:** `"rate limit"`, `"quota"`
- **Fallback Strategy:** Switch to OpenRouter version
- **Example:** `gpt-4o` → `openrouter/openai/gpt-4o`

**Connection Errors:**
- **Error Patterns:** `"connection"`, `"timeout"`
- **Fallback Strategy:** Switch to OpenRouter version
- **Example:** `gpt-4o` → `openrouter/openai/gpt-4o`

**Service Unavailable Errors:**
- **Error Patterns:** `"service unavailable"`, `"internal server error"`
- **Fallback Strategy:** Switch to OpenRouter version
- **Example:** `gpt-4o` → `openrouter/openai/gpt-4o`

### 4. xAI-Specific Errors

**Rate Limit Errors:**
- **Error Patterns:** `"rate limit"`, `"quota"`
- **Fallback Strategy:** Switch to OpenRouter version
- **Example:** `xai/grok-4` → `openrouter/x-ai/grok-4`

**Connection Errors:**
- **Error Patterns:** `"connection"`, `"timeout"`
- **Fallback Strategy:** Switch to OpenRouter version
- **Example:** `xai/grok-4` → `openrouter/x-ai/grok-4`

### 5. Generic Errors

**Connection/Timeout Errors:**
- **Error Patterns:** `"connection"`, `"timeout"`
- **Fallback Strategy:** Switch to OpenRouter version if not already using it
- **Examples:**
  - `anthropic/claude-3-sonnet` → `openrouter/anthropic/claude-sonnet-4`
  - `gpt-4o` → `openrouter/openai/gpt-4o`
  - `xai/grok-4` → `openrouter/x-ai/grok-4`

**Rate Limit Errors:**
- **Error Patterns:** `"rate limit"`, `"quota"`
- **Fallback Strategy:** Switch to OpenRouter version if not already using it
- **Examples:**
  - `anthropic/claude-3-sonnet` → `openrouter/anthropic/claude-sonnet-4`
  - `gpt-4o` → `openrouter/openai/gpt-4o`
  - `xai/grok-4` → `openrouter/x-ai/grok-4`

**Service Unavailable Errors:**
- **Error Patterns:** `"service unavailable"`, `"internal server error"`, `"bad gateway"`
- **Fallback Strategy:** Switch to OpenRouter version if not already using it
- **Examples:**
  - `anthropic/claude-3-sonnet` → `openrouter/anthropic/claude-sonnet-4`
  - `gpt-4o` → `openrouter/openai/gpt-4o`
  - `xai/grok-4` → `openrouter/x-ai/grok-4`

## Implementation Details

### Files Modified

1. **`services/llm.py`**
   - Added `detect_error_and_suggest_fallback()` function
   - Enhanced `make_llm_api_call()` to use error detection for better retry logic

2. **`agentpress/thread_manager.py`**
   - Updated auto-continue wrapper to use the new error detection function
   - Replaced hardcoded `AnthropicException - Overloaded` check with comprehensive error handling

3. **`agentpress/response_processor.py`**
   - Updated streaming response processing to use the new error detection function
   - Enhanced error logging with specific error types

### Error Detection Logic

The error detection is case-insensitive and looks for specific patterns in the error message:

```python
error_str = str(error).lower()
```

This ensures that errors like `"RATE LIMIT EXCEEDED"` and `"rate limit exceeded"` are treated the same way.

### Fallback Strategy

The system follows a hierarchical fallback strategy:

1. **Provider-Specific Fallbacks:** First, try provider-specific fallback models
2. **OpenRouter Fallbacks:** If not already using OpenRouter, switch to OpenRouter versions
3. **Model Family Fallbacks:** Within OpenRouter, try different models of the same family
4. **No Fallback:** If no appropriate fallback is found, return `False` for `should_fallback`

## Usage Examples

### Basic Usage

```python
from services.llm import detect_error_and_suggest_fallback

# Handle an error
try:
    # Make LLM API call
    response = await make_llm_api_call(messages, "gpt-4o")
except Exception as e:
    should_fallback, fallback_model, error_type = detect_error_and_suggest_fallback(e, "gpt-4o")
    
    if should_fallback:
        logger.info(f"Falling back to {fallback_model} due to {error_type}")
        response = await make_llm_api_call(messages, fallback_model)
    else:
        raise e
```

### Integration with Thread Manager

The error handling is automatically integrated into the thread manager's auto-continue logic:

```python
except Exception as e:
    should_fallback, fallback_model, error_type = detect_error_and_suggest_fallback(e, llm_model)
    
    if should_fallback:
        logger.error(f"{error_type} detected - Falling back to {fallback_model}: {str(e)}", exc_info=True)
        llm_model = fallback_model
        auto_continue = True
        continue
    else:
        # Handle non-fallback errors
        yield {"type": "status", "status": "error", "message": str(e)}
        return
```

## Testing

The error handling system includes comprehensive tests covering:

- All supported error types
- Case insensitivity
- Model-specific fallback strategies
- Edge cases (already using OpenRouter, unknown errors)

Run the tests with:

```bash
python3 -m pytest tests/test_error_handling.py -v
```

## Benefits

1. **Improved Reliability:** Automatic fallback to alternative models when primary models fail
2. **Better User Experience:** Reduced downtime due to provider-specific issues
3. **Comprehensive Coverage:** Handles multiple error types from different providers
4. **Intelligent Fallbacks:** Suggests appropriate fallback models based on the current model and error type
5. **Detailed Logging:** Provides specific error types for better monitoring and debugging

## Future Enhancements

Potential improvements to consider:

1. **Configurable Fallback Strategies:** Allow users to configure preferred fallback models
2. **Fallback Chains:** Support multiple fallback attempts with different models
3. **Performance Metrics:** Track fallback success rates and response times
4. **Provider Health Monitoring:** Proactively switch to healthier providers
5. **Cost Optimization:** Consider cost differences when suggesting fallbacks