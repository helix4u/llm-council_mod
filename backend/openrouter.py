"""OpenRouter API client for making LLM requests."""

import asyncio
import httpx
from typing import List, Dict, Any, Optional
from httpx import HTTPStatusError
from .config import OPENROUTER_API_KEY, OPENROUTER_API_URL, COUNCIL_MODELS, CHAIRMAN_MODEL


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


async def query_model(
    model: str,
    messages: List[Dict[str, str]],
    timeout: float = 45.0,
    max_retries: int = 2,
    retry_backoff: float = 1.5
) -> Optional[Dict[str, Any]]:
    """
    Query a single model via OpenRouter API.

    Args:
        model: OpenRouter model identifier (e.g., "openai/gpt-4o")
        messages: List of message dicts with 'role' and 'content'
        timeout: Request timeout in seconds

    Returns:
        Response dict with 'content' and optional 'reasoning_details', or None if failed
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
    while attempt < max_retries:
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(
                    OPENROUTER_API_URL,
                    headers=headers,
                    json=payload
                )
                if response.status_code == 429:
                    raise httpx.HTTPStatusError("rate limited", request=response.request, response=response)
                response.raise_for_status()

                data = response.json()
                message = data['choices'][0]['message']
                usage = data.get('usage', {})

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
            # retry on 429 / 503
            if e.response is not None and e.response.status_code in (429, 503):
                attempt += 1
                sleep_for = retry_backoff ** attempt
                await asyncio.sleep(min(sleep_for, 10))
                continue
            print(f"Error querying model {model}: {e}")
            return None
        except Exception as e:
            print(f"Error querying model {model}: {e}")
            return None
    return None


async def query_models_parallel(
    models: List[str],
    messages: List[Dict[str, str]],
    concurrency: int = 2
) -> Dict[str, Optional[Dict[str, Any]]]:
    """
    Query multiple models with limited concurrency to respect rate limits.
    """
    semaphore = asyncio.Semaphore(concurrency)
    results: Dict[str, Optional[Dict[str, Any]]] = {}

    async def run(model: str):
        async with semaphore:
            return await query_model(model, messages)

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
