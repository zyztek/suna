import pytest
from unittest.mock import Mock
from services.llm import detect_error_and_suggest_fallback


class TestErrorHandling:
    """Test the error detection and fallback suggestion system."""
    
    def test_anthropic_overloaded_error(self):
        """Test AnthropicException - Overloaded error detection."""
        error = Exception("AnthropicException - Overloaded")
        current_model = "anthropic/claude-3-sonnet"
        
        should_fallback, fallback_model, error_type = detect_error_and_suggest_fallback(error, current_model)
        
        assert should_fallback is True
        assert fallback_model == "openrouter/anthropic/claude-3-sonnet"
        assert error_type == "anthropic_overloaded"
    
    def test_anthropic_overloaded_already_openrouter(self):
        """Test AnthropicException - Overloaded when already using OpenRouter."""
        error = Exception("AnthropicException - Overloaded")
        current_model = "openrouter/anthropic/claude-3-sonnet"
        
        should_fallback, fallback_model, error_type = detect_error_and_suggest_fallback(error, current_model)
        
        assert should_fallback is False
        assert fallback_model == ""
        assert error_type == "anthropic_overloaded"
    
    def test_openrouter_connection_error(self):
        """Test OpenRouter connection error detection."""
        error = Exception("Connection timeout")
        current_model = "openrouter/anthropic/claude-3-sonnet"
        
        should_fallback, fallback_model, error_type = detect_error_and_suggest_fallback(error, current_model)
        
        assert should_fallback is True
        assert fallback_model == "openrouter/anthropic/claude-sonnet-4"
        assert error_type == "openrouter_connection"
    
    def test_openrouter_rate_limit_error(self):
        """Test OpenRouter rate limit error detection."""
        error = Exception("Rate limit exceeded")
        current_model = "openrouter/anthropic/claude-3-sonnet"
        
        should_fallback, fallback_model, error_type = detect_error_and_suggest_fallback(error, current_model)
        
        assert should_fallback is True
        assert fallback_model == "openrouter/anthropic/claude-3-5-sonnet"
        assert error_type == "openrouter_rate_limit"
    
    def test_openai_rate_limit_error(self):
        """Test OpenAI rate limit error detection."""
        error = Exception("Rate limit exceeded")
        current_model = "gpt-4o"
        
        should_fallback, fallback_model, error_type = detect_error_and_suggest_fallback(error, current_model)
        
        assert should_fallback is True
        assert fallback_model == "openrouter/openai/gpt-4o"
        assert error_type == "openai_rate_limit"
    
    def test_openai_connection_error(self):
        """Test OpenAI connection error detection."""
        error = Exception("Connection timeout")
        current_model = "gpt-4o"
        
        should_fallback, fallback_model, error_type = detect_error_and_suggest_fallback(error, current_model)
        
        assert should_fallback is True
        assert fallback_model == "openrouter/openai/gpt-4o"
        assert error_type == "openai_connection"
    
    def test_openai_service_unavailable_error(self):
        """Test OpenAI service unavailable error detection."""
        error = Exception("Internal server error")
        current_model = "gpt-4o"
        
        should_fallback, fallback_model, error_type = detect_error_and_suggest_fallback(error, current_model)
        
        assert should_fallback is True
        assert fallback_model == "openrouter/openai/gpt-4o"
        assert error_type == "openai_service_unavailable"
    
    def test_xai_rate_limit_error(self):
        """Test xAI rate limit error detection."""
        error = Exception("Rate limit exceeded")
        current_model = "xai/grok-4"
        
        should_fallback, fallback_model, error_type = detect_error_and_suggest_fallback(error, current_model)
        
        assert should_fallback is True
        assert fallback_model == "openrouter/x-ai/grok-4"
        assert error_type == "xai_rate_limit"
    
    def test_xai_connection_error(self):
        """Test xAI connection error detection."""
        error = Exception("Connection timeout")
        current_model = "xai/grok-4"
        
        should_fallback, fallback_model, error_type = detect_error_and_suggest_fallback(error, current_model)
        
        assert should_fallback is True
        assert fallback_model == "openrouter/x-ai/grok-4"
        assert error_type == "xai_connection"
    
    def test_generic_connection_error_claude(self):
        """Test generic connection error with Claude model."""
        error = Exception("Connection timeout")
        current_model = "anthropic/claude-3-sonnet"
        
        should_fallback, fallback_model, error_type = detect_error_and_suggest_fallback(error, current_model)
        
        assert should_fallback is True
        assert fallback_model == "openrouter/anthropic/claude-sonnet-4"
        assert error_type == "connection_timeout"
    
    def test_generic_connection_error_gpt(self):
        """Test generic connection error with GPT model."""
        error = Exception("Connection timeout")
        current_model = "gpt-4o"
        
        should_fallback, fallback_model, error_type = detect_error_and_suggest_fallback(error, current_model)
        
        assert should_fallback is True
        assert fallback_model == "openrouter/openai/gpt-4o"
        assert error_type == "connection_timeout"
    
    def test_generic_rate_limit_error_claude(self):
        """Test generic rate limit error with Claude model."""
        error = Exception("Rate limit exceeded")
        current_model = "anthropic/claude-3-sonnet"
        
        should_fallback, fallback_model, error_type = detect_error_and_suggest_fallback(error, current_model)
        
        assert should_fallback is True
        assert fallback_model == "openrouter/anthropic/claude-sonnet-4"
        assert error_type == "rate_limit"
    
    def test_generic_service_unavailable_error_gpt(self):
        """Test generic service unavailable error with GPT model."""
        error = Exception("Service unavailable")
        current_model = "gpt-4o"
        
        should_fallback, fallback_model, error_type = detect_error_and_suggest_fallback(error, current_model)
        
        assert should_fallback is True
        assert fallback_model == "openrouter/openai/gpt-4o"
        assert error_type == "service_unavailable"
    
    def test_unknown_error(self):
        """Test unknown error type."""
        error = Exception("Some random error")
        current_model = "gpt-4o"
        
        should_fallback, fallback_model, error_type = detect_error_and_suggest_fallback(error, current_model)
        
        assert should_fallback is False
        assert fallback_model == ""
        assert error_type == "unknown"
    
    def test_case_insensitive_error_detection(self):
        """Test that error detection is case insensitive."""
        error = Exception("RATE LIMIT EXCEEDED")
        current_model = "gpt-4o"
        
        should_fallback, fallback_model, error_type = detect_error_and_suggest_fallback(error, current_model)
        
        assert should_fallback is True
        assert fallback_model == "openrouter/openai/gpt-4o"
        assert error_type == "openai_rate_limit"
    
    def test_case_insensitive_model_detection(self):
        """Test that model detection is case insensitive."""
        error = Exception("Rate limit exceeded")
        current_model = "GPT-4O"
        
        should_fallback, fallback_model, error_type = detect_error_and_suggest_fallback(error, current_model)
        
        assert should_fallback is True
        assert fallback_model == "openrouter/openai/gpt-4o"
        assert error_type == "openai_rate_limit"


if __name__ == "__main__":
    pytest.main([__file__])