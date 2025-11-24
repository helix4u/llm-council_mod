"""3-stage LLM Council orchestration."""

from typing import List, Dict, Any, Tuple, Optional
from .openrouter import query_models_parallel, query_model
from .config import COUNCIL_MODELS, CHAIRMAN_MODEL


async def stage1_collect_responses(
    messages: List[Dict[str, str]],
    system_prompt: Optional[str] = None,
    models: Optional[List[str]] = None,
    persona_map: Optional[Dict[str, str]] = None
) -> List[Dict[str, Any]]:
    """
    Stage 1: Collect individual responses from all council models.

    Args:
        messages: Full message history (already includes latest user turn)
        system_prompt: Optional custom system prompt to prepend
        models: Optional override list of models

    Returns:
        List of dicts with 'model' and 'response' keys
    """
    prepared_messages = []

    if system_prompt:
        prepared_messages.append({"role": "system", "content": system_prompt})
    prepared_messages.extend(messages)

    target_models = models or COUNCIL_MODELS

    # apply per-model persona prompt if provided
    persona_prompts = {}
    if persona_map:
        # Try exact match first, then try matching by model name (without prefix)
        for model in target_models:
            if model in persona_map:
                persona_prompts[model] = persona_map[model]
            else:
                # Try matching by model name (e.g., "hermes-4-405b" matches "nousresearch/hermes-4-405b")
                model_name = model.split('/')[-1].split(':')[0]  # Get just the model name part
                for persona_key, persona_prompt in persona_map.items():
                    persona_key_name = persona_key.split('/')[-1].split(':')[0]
                    if persona_key_name == model_name:
                        persona_prompts[model] = persona_prompt
                        break

    async def call_model(model: str):
        model_messages = list(prepared_messages)
        if model in persona_prompts:
            model_messages = [{"role": "system", "content": persona_prompts[model]}] + model_messages
        return await query_model(model, model_messages)

    import asyncio
    tasks = [asyncio.create_task(call_model(m)) for m in target_models]
    responses_raw = {m: r for m, r in zip(target_models, await asyncio.gather(*tasks))}
    stage1_results = []
    for model, response in responses_raw.items():
        if response is not None:
            stage1_results.append({
                "model": model,
                "response": response.get('content', '')
            })

    return stage1_results


async def stage2_collect_rankings(
    user_query: str,
    stage1_results: List[Dict[str, Any]],
    system_prompt: Optional[str] = None,
    models: Optional[List[str]] = None
) -> Tuple[List[Dict[str, Any]], Dict[str, str]]:
    """
    Stage 2: Each model ranks the anonymized responses.

    Args:
        user_query: The original user query
        stage1_results: Results from Stage 1
        system_prompt: Optional custom system prompt

    Returns:
        Tuple of (rankings list, label_to_model mapping)
    """
    # Create anonymized labels for responses (Response A, Response B, etc.)
    labels = [chr(65 + i) for i in range(len(stage1_results))]  # A, B, C, ...

    # Create mapping from label to model name
    label_to_model = {
        f"Response {label}": result['model']
        for label, result in zip(labels, stage1_results)
    }

    # Build the ranking prompt
    responses_text = "\n\n".join([
        f"Response {label}:\n{result['response']}"
        for label, result in zip(labels, stage1_results)
    ])

    ranking_prompt = f"""You are evaluating different responses to the following question:

Question: {user_query}

Here are the responses from different models (anonymized):

{responses_text}

Your task:
1. First, evaluate each response individually. For each response, explain what it does well and what it does poorly.
2. Then, at the very end of your response, provide a final ranking.

IMPORTANT: Your final ranking MUST be formatted EXACTLY as follows:
- Start with the line "FINAL RANKING:" (all caps, with colon)
- Then list the responses from best to worst as a numbered list
- Each line should be: number, period, space, then ONLY the response label (e.g., "1. Response A")
- Do not add any other text or explanations in the ranking section

Example of the correct format for your ENTIRE response:

Response A provides good detail on X but misses Y...
Response B is accurate but lacks depth on Z...
Response C offers the most comprehensive answer...

FINAL RANKING:
1. Response C
2. Response A
3. Response B

Now provide your evaluation and ranking:"""

    messages = []
    
    # Add system prompt if provided
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    
    messages.append({"role": "user", "content": ranking_prompt})

    # Get rankings from all council models in parallel
    target_models = models or COUNCIL_MODELS
    responses = await query_models_parallel(target_models, messages)

    # Format results
    stage2_results = []
    for model, response in responses.items():
        if response is not None:
            try:
                full_text = response.get('content', '')
                if not full_text:
                    continue  # Skip empty responses
                parsed = parse_ranking_from_text(full_text)
                stage2_results.append({
                    "model": model,
                    "ranking": full_text,
                    "parsed_ranking": parsed
                })
            except Exception as e:
                print(f"Error processing ranking from {model}: {e}")
                # Continue with other models rather than failing completely
                continue

    return stage2_results, label_to_model


async def stage3_synthesize_final(
    user_query: str,
    stage1_results: List[Dict[str, Any]],
    stage2_results: List[Dict[str, Any]],
    system_prompt: Optional[str] = None,
    chairman_model: Optional[str] = None,
    history_summary: str = ""
) -> Dict[str, Any]:
    """
    Stage 3: Chairman synthesizes the final answer.

    Args:
        user_query: The user's original question
        stage1_results: Individual responses
        stage2_results: Peer rankings
        system_prompt: Optional system prompt for chairman
        chairman_model: Override default chairman model
        history_summary: Optional compact summary of earlier turns

    Returns:
        Dict with 'model' and 'response'
    """

    # Combine Stage 1 responses
    stage1_text = "\n\n".join([
        f"Model: {r['model']}\nResponse:\n{r['response']}" for r in stage1_results
    ])

    # Combine Stage 2 rankings/evaluations
    stage2_text = "\n\n".join([
        f"Model: {r['model']}\nRanking/Eval:\n{r['ranking']}" for r in stage2_results
    ])

    context_note = f"\n\nConversation summary for context:\n{history_summary}" if history_summary else ""

    chairman_prompt = f"""You are the Chairman of the LLM Council.

User Question:
{user_query}

STAGE 1 - Individual Responses:
{stage1_text}

STAGE 2 - Peer Rankings:
{stage2_text}
{context_note}

Your task as Chairman is to synthesize all of this information into a single, comprehensive, accurate answer to the user's original question. Consider:
- The individual responses and their insights
- The peer rankings and what they reveal about response quality
- Any patterns of agreement or disagreement

Provide a clear, well-reasoned final answer that represents the council's collective wisdom:"""

    messages = []

    # Add system prompt if provided
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})

    messages.append({"role": "user", "content": chairman_prompt})

    selected_chairman = chairman_model or CHAIRMAN_MODEL
    response = await query_model(selected_chairman, messages)

    if response is None:
        # Fallback if chairman fails
        return {
            "model": selected_chairman,
            "response": "Error: Unable to generate final synthesis."
        }

    return {
        "model": selected_chairman,
        "response": response.get('content', '')
    }


def parse_ranking_from_text(ranking_text: str) -> List[str]:
    """
    Parse the FINAL RANKING section from the model's response.

    Args:
        ranking_text: The full text response from the model

    Returns:
        List of response labels in ranked order
    """
    import re

    # Look for "FINAL RANKING:" section
    if "FINAL RANKING:" in ranking_text:
        # Extract everything after "FINAL RANKING:"
        parts = ranking_text.split("FINAL RANKING:")
        if len(parts) >= 2:
            ranking_section = parts[1]
            # Try to extract numbered list format (e.g., "1. Response A")
            # This pattern looks for: number, period, optional space, "Response X"
            numbered_matches = re.findall(r'\d+\.\s*Response [A-Z]', ranking_section)
            if numbered_matches:
                # Extract just the "Response X" part
                return [re.search(r'Response [A-Z]', m).group() for m in numbered_matches]

            # Fallback: Extract all "Response X" patterns in order
            matches = re.findall(r'Response [A-Z]', ranking_section)
            return matches

    # Fallback: try to find any "Response X" patterns in order
    matches = re.findall(r'Response [A-Z]', ranking_text)
    return matches


def calculate_aggregate_rankings(
    stage2_results: List[Dict[str, Any]],
    label_to_model: Dict[str, str]
) -> List[Dict[str, Any]]:
    """
    Calculate aggregate rankings across all models.

    Args:
        stage2_results: Rankings from each model
        label_to_model: Mapping from anonymous labels to model names

    Returns:
        List of dicts with model name and average rank, sorted best to worst
    """
    from collections import defaultdict

    # Track positions for each model
    model_positions = defaultdict(list)

    for ranking in stage2_results:
        try:
            ranking_text = ranking.get('ranking', '')
            if not ranking_text:
                continue

            # Parse the ranking from the structured format
            parsed_ranking = parse_ranking_from_text(ranking_text)

            for position, label in enumerate(parsed_ranking, start=1):
                if label in label_to_model:
                    model_name = label_to_model[label]
                    model_positions[model_name].append(position)
        except Exception as e:
            print(f"Error processing ranking in aggregate calculation: {e}")
            # Continue with other rankings rather than failing completely
            continue

    # Calculate average position for each model
    aggregate = []
    for model, positions in model_positions.items():
        if positions:
            avg_rank = sum(positions) / len(positions)
            aggregate.append({
                "model": model,
                "average_rank": round(avg_rank, 2),
                "rankings_count": len(positions)
            })

    # Sort by average rank (lower is better)
    aggregate.sort(key=lambda x: x['average_rank'])

    return aggregate


async def generate_conversation_title(user_query: str) -> str:
    """
    Generate a short title for a conversation based on the first user message.

    Args:
        user_query: The first user message

    Returns:
        A short title (3-5 words)
    """
    title_prompt = f"""Generate a very short title (3-5 words maximum) that summarizes the following question.
The title should be concise and descriptive. Do not use quotes or punctuation in the title.

Question: {user_query}

Title:"""

    messages = [{"role": "user", "content": title_prompt}]

    # Use gemini-2.5-flash for title generation (fast and cheap)
    response = await query_model("google/gemini-2.5-flash", messages, timeout=30.0)

    if response is None:
        # Fallback to a generic title
        return "New Conversation"

    title = response.get('content', 'New Conversation').strip()

    # Clean up the title - remove quotes, limit length
    title = title.strip('"\'')

    # Truncate if too long
    if len(title) > 50:
        title = title[:47] + "..."

    return title


async def run_full_council(
    user_query: str,
    history_messages: List[Dict[str, str]],
    system_prompt: Optional[str] = None,
    council_models: Optional[List[str]] = None,
    chairman_model: Optional[str] = None,
    history_summary: str = "",
    persona_map: Optional[Dict[str, str]] = None
) -> Tuple[List, List, Dict, Dict]:
    """
    Run the complete 3-stage council process.

    Args:
        user_query: The user's question
        system_prompt: Optional custom system prompt for all stages

    Returns:
        Tuple of (stage1_results, stage2_results, stage3_result, metadata)
    """
    # Stage 1: Collect individual responses (with history for context)
    stage1_results = await stage1_collect_responses(
        history_messages,
        system_prompt=system_prompt,
        models=council_models,
        persona_map=persona_map
    )

    # If no models responded successfully, return error
    if not stage1_results:
        return [], [], {
            "model": "error",
            "response": "All models failed to respond. Please try again."
        }, {}

    # Stage 2: Collect rankings
    # Use the models that actually responded in Stage 1, not the configured models
    # This ensures Stage 2 ranks using the same models that produced responses
    actual_models_from_stage1 = [result['model'] for result in stage1_results]
    stage2_results, label_to_model = await stage2_collect_rankings(
        user_query,
        stage1_results,
        system_prompt=system_prompt,
        models=actual_models_from_stage1 if actual_models_from_stage1 else council_models
    )

    # Calculate aggregate rankings
    aggregate_rankings = calculate_aggregate_rankings(stage2_results, label_to_model)

    # Stage 3: Synthesize final answer
    stage3_result = await stage3_synthesize_final(
        user_query,
        stage1_results,
        stage2_results,
        system_prompt=system_prompt,
        chairman_model=chairman_model,
        history_summary=history_summary
    )

    # Prepare metadata
    metadata = {
        "label_to_model": label_to_model,
        "aggregate_rankings": aggregate_rankings
    }

    return stage1_results, stage2_results, stage3_result, metadata
