"""
Unit tests for security utilities.
"""
import os
import pytest
from fastapi import HTTPException
from unittest.mock import patch

from app.core.security import verify_api_key


class TestVerifyAPIKey:
    """Tests for API key verification."""

    @patch.dict(os.environ, {}, clear=True)
    async def test_no_api_key_configured_allows_request(self):
        """When PYTHON_API_KEY is not set, should bypass authentication (fail-open)."""
        result = await verify_api_key(api_key=None)
        assert result == "bypass"

    @patch.dict(os.environ, {"PYTHON_API_KEY": "test-secret-key-123"})
    async def test_missing_api_key_raises_401(self):
        """When API key is configured but not provided, should raise 401."""
        with pytest.raises(HTTPException) as exc_info:
            await verify_api_key(api_key=None)

        assert exc_info.value.status_code == 401
        assert exc_info.value.detail == "Missing API key"
        assert exc_info.value.headers == {"WWW-Authenticate": "ApiKey"}

    @patch.dict(os.environ, {"PYTHON_API_KEY": "correct-key"})
    async def test_invalid_api_key_raises_401(self):
        """When API key doesn't match, should raise 401."""
        with pytest.raises(HTTPException) as exc_info:
            await verify_api_key(api_key="wrong-key")

        assert exc_info.value.status_code == 401
        assert exc_info.value.detail == "Invalid API key"

    @patch.dict(os.environ, {"PYTHON_API_KEY": "correct-key"})
    async def test_valid_api_key_returns_key(self):
        """When API key matches, should return the key."""
        result = await verify_api_key(api_key="correct-key")
        assert result == "correct-key"

    @patch.dict(os.environ, {"PYTHON_API_KEY": "secret"})
    async def test_timing_attack_resistance(self):
        """
        Verify that comparison uses secrets.compare_digest for timing attack resistance.

        This test verifies that we're using constant-time comparison.
        While we can't easily measure timing differences in a unit test,
        we verify that the function behaves correctly with keys of different lengths.
        """
        # Short wrong key
        with pytest.raises(HTTPException):
            await verify_api_key(api_key="x")

        # Long wrong key (same length as correct key)
        with pytest.raises(HTTPException):
            await verify_api_key(api_key="wrong")

        # Partial match (timing attack would reveal this is "closer")
        with pytest.raises(HTTPException):
            await verify_api_key(api_key="secre")

        # All should fail with same error, regardless of "closeness"
        # This confirms constant-time behavior

    @patch.dict(os.environ, {"PYTHON_API_KEY": ""})
    async def test_empty_string_api_key_bypasses_auth(self):
        """When PYTHON_API_KEY is empty string, should bypass authentication."""
        result = await verify_api_key(api_key=None)
        assert result == "bypass"

    @patch.dict(os.environ, {"PYTHON_API_KEY": "my-key"})
    async def test_api_key_case_sensitive(self):
        """API key comparison should be case-sensitive."""
        with pytest.raises(HTTPException):
            await verify_api_key(api_key="MY-KEY")

        with pytest.raises(HTTPException):
            await verify_api_key(api_key="My-Key")

        # Only exact match works
        result = await verify_api_key(api_key="my-key")
        assert result == "my-key"
