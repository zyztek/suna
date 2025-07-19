# Length and Context Window Auto-Continue Feature

## Overview

This feature automatically continues the LLM loop in the agent when the previous stop reason was due to length or context window problems. This ensures that agents can complete their tasks even when responses are truncated due to token limits or context window constraints.

## Problem Statement

When LLMs reach their token limits or context window boundaries, they may return finish reasons like:
- `"length"` - Response reached the maximum token limit
- `"context_length_exceeded"` - Context window was exceeded  
- `"max_tokens"` - Maximum tokens were reached

Previously, the agent would stop execution when encountering these finish reasons, potentially leaving tasks incomplete.

## Solution

The agent now automatically continues the LLM loop when it encounters these specific finish reasons, similar to how it already handles `"tool_calls"` finish reasons.

## Implementation Details

### Modified Files

1. **`backend/agentpress/thread_manager.py`**
   - Updated `auto_continue_wrapper()` function to detect length/context finish reasons
   - Added logic to continue the loop for `"length"`, `"context_length_exceeded"`, and `"max_tokens"` finish reasons
   - Updated documentation and logging messages

### Auto-Continue Logic

The auto-continue logic in `ThreadManager.auto_continue_wrapper()` now handles:

```python
if chunk.get('type') == 'finish':
    finish_reason = chunk.get('finish_reason')
    
    if finish_reason == 'tool_calls':
        # Existing behavior - continue for tool calls
        auto_continue = True
    elif finish_reason == 'xml_tool_limit_reached':
        # Don't continue for XML tool limits
        auto_continue = False
    elif finish_reason in ['length', 'context_length_exceeded', 'max_tokens']:
        # NEW: Continue for length/context issues
        auto_continue = True
```

### Finish Reasons Handled

#### Auto-Continue Enabled For:
- `"tool_calls"` - Existing behavior for function/tool calls
- `"length"` - Response truncated due to token limit
- `"context_length_exceeded"` - Context window exceeded
- `"max_tokens"` - Maximum tokens reached

#### Auto-Continue Disabled For:
- `"stop"` - Normal completion
- `"xml_tool_limit_reached"` - XML tool limit reached
- `"agent_terminated"` - Agent terminated
- Any other finish reason

## Configuration

The feature is controlled by the `native_max_auto_continues` parameter:

```python
response = await thread_manager.run_thread(
    # ... other parameters ...
    native_max_auto_continues=25,  # Enable auto-continue (0 = disabled)
    # ... other parameters ...
)
```

- **`native_max_auto_continues > 0`**: Enables auto-continue for both tool calls and length/context issues
- **`native_max_auto_continues = 0`**: Disables all auto-continue functionality

## Usage Examples

### Basic Usage

```python
# Enable auto-continue for up to 25 iterations
response = await thread_manager.run_thread(
    thread_id=thread_id,
    system_prompt=system_message,
    stream=stream,
    llm_model=model_name,
    native_max_auto_continues=25,  # Enable the feature
    # ... other parameters ...
)
```

### Disable Auto-Continue

```python
# Disable auto-continue completely
response = await thread_manager.run_thread(
    thread_id=thread_id,
    system_prompt=system_message,
    stream=stream,
    llm_model=model_name,
    native_max_auto_continues=0,  # Disable the feature
    # ... other parameters ...
)
```

## Benefits

1. **Improved Task Completion**: Agents can now complete tasks even when responses are truncated
2. **Better User Experience**: Users don't need to manually continue conversations when limits are hit
3. **Automatic Recovery**: The agent automatically recovers from length/context limitations
4. **Backward Compatibility**: Existing behavior for tool calls is preserved

## Limitations

1. **Maximum Iterations**: Still limited by `native_max_auto_continues` to prevent infinite loops
2. **Context Compression**: May trigger context compression if the conversation becomes very long
3. **Performance**: Multiple iterations may increase response time and token usage

## Monitoring and Logging

The feature includes comprehensive logging:

```
INFO: Detected finish_reason='length' (length/context limit), auto-continuing (1/25)
INFO: Detected finish_reason='context_length_exceeded' (length/context limit), auto-continuing (2/25)
INFO: Detected finish_reason='max_tokens' (length/context limit), auto-continuing (3/25)
```

## Testing

The feature can be tested by:

1. **Manual Testing**: Trigger responses that hit token limits
2. **Unit Testing**: Mock different finish reasons and verify behavior
3. **Integration Testing**: Test with real LLM APIs that return length/context finish reasons

## Future Enhancements

Potential improvements could include:

1. **Smart Context Management**: Automatically compress context when approaching limits
2. **Adaptive Limits**: Adjust max tokens based on conversation length
3. **User Feedback**: Notify users when auto-continue is triggered
4. **Metrics**: Track auto-continue usage and success rates

## Related Components

- **ContextManager**: Handles context compression and token management
- **ResponseProcessor**: Processes LLM responses and extracts finish reasons
- **ThreadManager**: Orchestrates the auto-continue logic
- **Agent Run Loop**: Main agent execution loop that uses this functionality