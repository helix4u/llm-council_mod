"""OpenRouter API client for making LLM requests."""

import asyncio
import httpx
import time
from typing import List, Dict, Any, Optional
from httpx import HTTPStatusError
from collections import defaultdict
from .config import OPENROUTER_API_KEY, OPENROUTER_API_URL, COUNCIL_MODELS, CHAIRMAN_MODEL


class FreeModelRateLimiter:
    """
    Rate limiter for free models to prevent 429 errors.
    Ensures free models are queried at most once every 5 seconds.
    """
    def __init__(self, min_interval: float = 5.0):
        self.min_interval = min_interval
        self.last_request_time: Dict[str, float] = defaultdict(float)
        self.lock = asyncio.Lock()
    
    def is_free_model(self, model: str) -> bool:
        """Check if a model is a free model (has :free suffix)."""
        return ":free" in model.lower()
    
    async def wait_if_needed(self, model: str) -> float:
        """
        Wait if necessary to maintain rate limit for free models.
        Returns the wait time (0 if no wait needed).
        """
        if not self.is_free_model(model):
            return 0.0
        
        async with self.lock:
            current_time = time.time()
            last_time = self.last_request_time[model]
            time_since_last = current_time - last_time
            
            if time_since_last < self.min_interval:
                wait_time = self.min_interval - time_since_last
                await asyncio.sleep(wait_time)
                # Update after waiting
                self.last_request_time[model] = time.time()
                return wait_time
            else:
                # Update immediately if enough time has passed
                self.last_request_time[model] = current_time
                return 0.0


# Global rate limiter instance
_free_model_rate_limiter = FreeModelRateLimiter(min_interval=5.0)


def _fallback_models() -> List[Dict[str, Any]]:
    """Return configured models as a safe fallback list."""
    fallback = set(COUNCIL_MODELS + [CHAIRMAN_MODEL])
    return [{
        "id": mid,
        "name": mid,
        "context_length": None,
        "pricing": {"prompt": None, "completion": None},
        "description": "Configured model (fallback)",
        "architecture": {},
        "source": "config",
    } for mid in sorted(fallback)]


def _parse_rate_limit_headers(response: httpx.Response) -> Dict[str, Any]:
    """
    Parse rate limit headers from response.
    
    Returns:
        Dict with 'wait_seconds', 'reset_timestamp', 'limit', 'remaining'
    """
    headers = response.headers
    rate_limit_info = {
        'wait_seconds': None,
        'reset_timestamp': None,
        'limit': None,
        'remaining': None
    }
    
    # Check for retry-after header (seconds to wait)
    retry_after = headers.get('retry-after')
    if retry_after:
        try:
            rate_limit_info['wait_seconds'] = float(retry_after)
        except (ValueError, TypeError):
            pass
    
    # Check for x-ratelimit-reset (timestamp when limit resets)
    reset_header = headers.get('x-ratelimit-reset')
    if reset_header:
        try:
            reset_timestamp = float(reset_header)
            current_time = time.time()
            wait_until_reset = max(0, reset_timestamp - current_time)
            # Use the longer wait time if both are present
            if rate_limit_info['wait_seconds'] is None or wait_until_reset > rate_limit_info['wait_seconds']:
                rate_limit_info['wait_seconds'] = wait_until_reset
            rate_limit_info['reset_timestamp'] = reset_timestamp
        except (ValueError, TypeError):
            pass
    
    # Store limit and remaining for logging
    limit_header = headers.get('x-ratelimit-limit')
    if limit_header:
        try:
            rate_limit_info['limit'] = int(limit_header)
        except (ValueError, TypeError):
            pass
    
    remaining_header = headers.get('x-ratelimit-remaining')
    if remaining_header:
        try:
            rate_limit_info['remaining'] = int(remaining_header)
        except (ValueError, TypeError):
            pass
    
    return rate_limit_info


async def query_model(
    model: str,
    messages: List[Dict[str, str]],
    timeout: float = 45.0,
    max_retries: int = 5,
    retry_backoff: float = 1.5,
    base_timeout: Optional[float] = None
) -> Optional[Dict[str, Any]]:
    """
    Query a single model via OpenRouter API with rate limit handling.

    Args:
        model: OpenRouter model identifier (e.g., "openai/gpt-4o")
        messages: List of message dicts with 'role' and 'content'
        timeout: Request timeout in seconds (will be extended for rate limits)
        max_retries: Maximum number of retry attempts (increased for rate limits)
        retry_backoff: Backoff multiplier for exponential backoff
        base_timeout: Original timeout before rate limit extensions (for logging)

    Returns:
        Response dict with 'content' and optional 'reasoning_details', or None if failed.
        On failure, returns dict with 'error' key containing error details.
    """
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": model,
        "messages": messages,
    }

    attempt = 0
    last_error = None
    total_wait_time = 0.0
    original_timeout = base_timeout or timeout
    
    # Wait for rate limit if this is a free model (before first attempt)
    if attempt == 0:
        rate_limit_wait = await _free_model_rate_limiter.wait_if_needed(model)
        if rate_limit_wait > 0:
            total_wait_time += rate_limit_wait
            print(f"Rate limiting free model {model}: waited {rate_limit_wait:.1f}s to maintain 5s spacing")
    
    while attempt < max_retries:
        try:
            # Extend timeout to account for any rate limit waits
            extended_timeout = timeout + total_wait_time + 10  # Add buffer
            
            async with httpx.AsyncClient(timeout=extended_timeout) as client:
                response = await client.post(
                    OPENROUTER_API_URL,
                    headers=headers,
                    json=payload
                )
                
                # Handle 429 rate limit with header parsing
                if response.status_code == 429:
                    rate_limit_info = _parse_rate_limit_headers(response)
                    wait_seconds = rate_limit_info.get('wait_seconds')
                    
                    if wait_seconds is None:
                        # Fallback to exponential backoff if no header
                        wait_seconds = min(retry_backoff ** attempt, 60)
                    else:
                        # Add small buffer to ensure we wait past the reset
                        wait_seconds = wait_seconds + 1.0
                    
                    # Cap wait time at 5 minutes to prevent excessive delays
                    wait_seconds = min(wait_seconds, 300)
                    
                    limit = rate_limit_info.get('limit', 'unknown')
                    remaining = rate_limit_info.get('remaining', 'unknown')
                    reset_time = rate_limit_info.get('reset_timestamp')
                    
                    print(f"Rate limited for model {model}: limit={limit}, remaining={remaining}, waiting {wait_seconds:.1f}s")
                    if reset_time:
                        reset_datetime = time.strftime('%H:%M:%S', time.localtime(reset_time))
                        print(f"  Rate limit resets at {reset_datetime}")
                    
                    attempt += 1
                    if attempt < max_retries:
                        await asyncio.sleep(wait_seconds)
                        total_wait_time += wait_seconds
                        
                        # For free models, update our rate limiter after 429 wait
                        # This ensures we maintain spacing even after server rate limits
                        if _free_model_rate_limiter.is_free_model(model):
                            async with _free_model_rate_limiter.lock:
                                _free_model_rate_limiter.last_request_time[model] = time.time()
                        
                        continue
                    else:
                        # Exhausted retries
                        raise httpx.HTTPStatusError(
                            f"Rate limit exceeded after {max_retries} attempts (waited {total_wait_time:.1f}s total)",
                            request=response.request,
                            response=response
                        )
                
                response.raise_for_status()

                data = response.json()
                message = data['choices'][0]['message']
                usage = data.get('usage', {})

                # Update rate limiter for free models after successful request
                if _free_model_rate_limiter.is_free_model(model):
                    async with _free_model_rate_limiter.lock:
                        _free_model_rate_limiter.last_request_time[model] = time.time()

                return {
                    'content': message.get('content'),
                    'reasoning_details': message.get('reasoning_details'),
                    'usage': {
                        'prompt_tokens': usage.get('prompt_tokens', 0),
                        'completion_tokens': usage.get('completion_tokens', 0),
                        'total_tokens': usage.get('total_tokens', 0)
                    }
                }

        except httpx.HTTPStatusError as e:
            status_code = e.response.status_code if e.response else None
            last_error = e
            
            # Retry on service unavailable (503, 502) with backoff
            if status_code in (503, 502):
                attempt += 1
                if attempt < max_retries:
                    sleep_for = min(retry_backoff ** attempt, 30)
                    total_wait_time += sleep_for
                    print(f"Server error {status_code} for model {model}, retrying in {sleep_for:.1f}s (attempt {attempt}/{max_retries})")
                    await asyncio.sleep(sleep_for)
                    continue
            
            # Don't retry on client errors (400, 404, etc.) - these are permanent
            error_msg = str(e)
            if status_code:
                error_msg = f"HTTP {status_code}: {error_msg}"
            
            # Log with context
            error_type = "not found" if status_code == 404 else "bad request" if status_code == 400 else "server error" if status_code and status_code >= 500 else "client error"
            print(f"Error querying model {model} ({error_type}): {error_msg}")
            
            return {
                'error': {
                    'type': error_type,
                    'status_code': status_code,
                    'message': error_msg,
                    'model': model
                }
            }
        except httpx.TimeoutException as e:
            last_error = e
            attempt += 1
            if attempt < max_retries:
                sleep_for = retry_backoff ** attempt
                await asyncio.sleep(min(sleep_for, 10))
                continue
            total_time = timeout + total_wait_time
            print(f"Timeout querying model {model} after {max_retries} attempts (total wait: {total_wait_time:.1f}s, timeout: {timeout}s)")
            return {
                'error': {
                    'type': 'timeout',
                    'status_code': None,
                    'message': f"Request timed out after {total_time:.1f}s (including {total_wait_time:.1f}s rate limit waits)",
                    'model': model
                }
            }
        except Exception as e:
            last_error = e
            error_msg = str(e)
            print(f"Unexpected error querying model {model}: {error_msg}")
            return {
                'error': {
                    'type': 'unknown',
                    'status_code': None,
                    'message': error_msg,
                    'model': model
                }
            }
    
    # If we exhausted retries, return the last error
    if last_error:
        status_code = last_error.response.status_code if hasattr(last_error, 'response') and last_error.response else None
        return {
            'error': {
                'type': 'retry_exhausted',
                'status_code': status_code,
                'message': f"Failed after {max_retries} attempts: {str(last_error)}",
                'model': model
            }
        }
    
    return None


async def query_models_parallel(
    models: List[str],
    messages: List[Dict[str, str]],
    concurrency: int = 2,
    timeout: float = 45.0
) -> Dict[str, Optional[Dict[str, Any]]]:
    """
    Query multiple models with limited concurrency to respect rate limits.
    
    Args:
        models: List of model identifiers to query
        messages: List of message dicts with 'role' and 'content'
        concurrency: Maximum number of concurrent requests
        timeout: Base timeout per request (will be extended for rate limits)
    
    Returns:
        Dict mapping model names to their responses (or error dicts)
    """
    semaphore = asyncio.Semaphore(concurrency)
    results: Dict[str, Optional[Dict[str, Any]]] = {}

    async def run(model: str):
        async with semaphore:
            # Pass base_timeout so we can track original timeout for logging
            return await query_model(model, messages, timeout=timeout, base_timeout=timeout)

    tasks = {model: asyncio.create_task(run(model)) for model in models}
    for model, task in tasks.items():
        results[model] = await task

    return results


async def list_models(query: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Fetch available models (and pricing) from OpenRouter.
    Returns a safe fallback list if the API is unreachable or unauthorized.
    """
    # If no API key, skip remote call and return fallback
    if not OPENROUTER_API_KEY:
        return _fallback_models()

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
    }

    url = "https://openrouter.ai/api/v1/models"

    data = []
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json().get("data", [])
    except HTTPStatusError:
        # Any HTTP error: fall back silently
        data = []
    except Exception:
        data = []

    models = []
    for item in data:
        pricing = item.get("pricing", {}) or {}
        models.append({
            "id": item.get("id"),
            "name": item.get("name") or item.get("id"),
            "context_length": item.get("context_length"),
            "pricing": {
                "prompt": pricing.get("prompt"),
                "completion": pricing.get("completion"),
            },
            "description": item.get("description"),
            "architecture": item.get("architecture", {}),
            "source": "openrouter",
        })

    # Fallback to configured models if none returned
    if not models:
        models = _fallback_models()

    # Local filtering by query substring (id/name/description)
    if query:
        q = query.lower()
        models = [
            m for m in models
            if q in (m.get("id") or "").lower()
            or q in (m.get("name") or "").lower()
            or q in (m.get("description") or "").lower()
        ]

    return models
