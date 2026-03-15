"""Simple Portkey-backed chat agent with UrbanTrace dataset context."""

from __future__ import annotations

import csv
import json
import os
import time
from pathlib import Path
from typing import Any
from portkey_ai import Portkey
from tool import (
    build_frontend_actions_from_tool_calls,
    build_tool_responses_from_tool_calls,
    get_dashboard_snapshot_json,
)

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover
    def load_dotenv() -> bool:
        return False

load_dotenv()

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_METADATA_DIR = PROJECT_ROOT / "data" / "metadata"
DEFAULT_DESCRIPTIONS_CSV = PROJECT_ROOT / "data" / "descriptions.csv"


class UrbanTraceCopilot:
    """Very small helper around Portkey chat.completions for UrbanTrace."""

    def __init__(
        self,
        metadata_dir: str | Path = DEFAULT_METADATA_DIR,
        descriptions_csv: str | Path = DEFAULT_DESCRIPTIONS_CSV,
    ) -> None:

        resolved_api_key = os.getenv("PORTKEY_API_KEY")
        resolved_model = os.getenv("PORTKEY_MODEL", "@gpt-5-mini/gpt-5-mini")

        if not resolved_api_key:
            raise ValueError(
                "Missing Portkey API key. Set PORTKEY_API_KEY or pass api_key."
            )

        self.portkey = Portkey(
            base_url="https://ai-gateway.apps.cloud.rt.nyu.edu/v1",
            api_key=resolved_api_key,
            model=resolved_model,
            strict_open_ai_compliance=False,
        )
        self.model = resolved_model
        self.metadata_dir = Path(metadata_dir)
        self.descriptions_csv = Path(descriptions_csv)
        self.dataset_descriptions: dict[str, str] = {}
        self.dataset_context = self._build_dataset_context()
        self.dashboard_state: dict[str, list[dict[str, Any]]] = {"nodes": [], "edges": []}

    @staticmethod
    def _normalize_dataset_id(name: str) -> str:
        dataset_id = name.strip()
        if dataset_id.endswith(".geojson"):
            dataset_id = dataset_id[: -len(".geojson")]
        if dataset_id.endswith("_metadata"):
            dataset_id = dataset_id[: -len("_metadata")]
        return dataset_id

    def _load_descriptions(self) -> dict[str, str]:
        descriptions: dict[str, str] = {}
        if not self.descriptions_csv.exists():
            return descriptions

        with self.descriptions_csv.open("r", encoding="utf-8", newline="") as csv_file:
            reader = csv.DictReader(csv_file)
            if not reader.fieldnames:
                return descriptions

            id_candidates = ("dataset", "dataset_id", "id", "name", "filename")
            description_candidates = ("description", "summary", "details")

            id_key = next(
                (key for key in id_candidates if key in reader.fieldnames),
                reader.fieldnames[0],
            )
            description_key = next(
                (key for key in description_candidates if key in reader.fieldnames),
                reader.fieldnames[1] if len(reader.fieldnames) > 1 else reader.fieldnames[0],
            )

            for row in reader:
                raw_name = (row.get(id_key) or "").strip()
                if not raw_name:
                    continue
                dataset_id = self._normalize_dataset_id(raw_name)
                description = (row.get(description_key) or "").strip()
                descriptions[dataset_id] = description

        return descriptions

    def _load_metadata(self) -> dict[str, dict[str, Any]]:
        metadata: dict[str, dict[str, Any]] = {}
        if not self.metadata_dir.exists():
            return metadata

        for path in sorted(self.metadata_dir.glob("*_metadata.json")):
            dataset_id = self._normalize_dataset_id(path.stem)
            try:
                with path.open("r", encoding="utf-8") as metadata_file:
                    metadata[dataset_id] = json.load(metadata_file)
            except (OSError, json.JSONDecodeError):
                continue
        return metadata

    def _build_dataset_context(
        self,
        max_description_chars: int = 500,
    ) -> str:
        descriptions = self._load_descriptions()
        self.dataset_descriptions = descriptions
        metadata = self._load_metadata()
        dataset_ids = sorted(set(descriptions) | set(metadata))

        if not dataset_ids:
            return "No dataset descriptions or metadata were found."

        context_lines = [
            "UrbanTrace dataset catalog:",
            "Use this context when answering dataset questions.",
        ]

        for dataset_id in dataset_ids:
            dataset_meta = metadata.get(dataset_id, {})

            description = descriptions.get(dataset_id, "No description available.")
            if len(description) > max_description_chars:
                description = f"{description[:max_description_chars].rstrip()}..."

            context_lines.append(
                (
                    f"- {dataset_id}: "
                    f"geometry={dataset_meta.get('geometricType', 'unknown')}; "
                    f"rows={dataset_meta.get('nb_rows', 'unknown')}; "
                    "profile=Refer to metadata/dashboard context for profile columns; "
                    f"description={description}"
                )
            )

        return "\n".join(context_lines)

    def refresh_dataset_context(self) -> str:
        """Reload metadata + descriptions from disk."""
        self.dataset_context = self._build_dataset_context()
        return self.dataset_context

    def set_dashboard_state(
        self,
        nodes: list[dict[str, Any]] | None,
        edges: list[dict[str, Any]] | None,
    ) -> None:
        """
        Store the current ReactFlow dashboard graph from the frontend canvas.
        """
        self.dashboard_state = {
            "nodes": nodes if isinstance(nodes, list) else [],
            "edges": edges if isinstance(edges, list) else [],
        }

    def _build_dashboard_context_message(self) -> str:
        snapshot_json = get_dashboard_snapshot_json(
            dashboard_state=self.dashboard_state,
            descriptions_by_dataset=self.dataset_descriptions,
        )
        return (
            "You have access to the current UrbanTrace dashboard state (ReactFlow canvas):\n"
            f"{snapshot_json}\n"
            "Use this dashboard context directly when answering questions about nodes, "
            "connections, and selected datasets."
        )

    def _create_completion(self, payload: dict[str, Any], retries: int) -> Any:
        attempt = 0
        while True:
            try:
                return self.portkey.chat.completions.create(**payload)
            except Exception as exc:
                message = str(exc)

                retryable = any(code in message for code in ("502", "503", "504", "Bad Gateway"))
                if retryable and attempt < retries:
                    time.sleep(1.25 * (attempt + 1))
                    attempt += 1
                    continue
                raise

    def _build_messages(
        self,
        user_message: str,
        system_prompt: str,
        include_tool_guidance: bool = False,
    ) -> list[dict[str, Any]]:
        """Build chat messages with system, dataset, and dashboard context."""
        messages: list[dict[str, Any]] = [
            {
                "role": "system",
                "content": [{"type": "text", "text": system_prompt}],
            },
            {
                "role": "system",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "You have access to these UrbanTrace dataset descriptions "
                            "and metadata:\n"
                            f"{self.dataset_context}"
                        ),
                    }
                ],
            },
            {
                "role": "system",
                "content": [
                    {
                        "type": "text",
                        "text": self._build_dashboard_context_message(),
                    }
                ],
            },
        ]

        if include_tool_guidance:
            messages.append(
                {
                    "role": "system",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                "When a user asks to add or place a dataset on the canvas, "
                                "call add_dataset_node with dataset_id;"
                                "and try to include a color_by column if you find a suitable one in the metadata based on the current dashboard coloring and dataset columns."
                                "Use ids/column names from dataset context and avoid guessing."
                                "After any tool call, also provide a short natural-language explanation to the user."
                            ),
                        }
                    ],
                }
            )

        messages.append({"role": "user", "content": user_message})
        return messages

    def _complete_messages(
        self,
        messages: list[dict[str, Any]],
        stream: bool,
        model: str | None,
        thinking_budget_tokens: int | None,
        retries: int,
        tools: list[dict[str, Any]] | None = None,
    ) -> Any:
        model_name = model or self.model
        payload: dict[str, Any] = {
            "model": model_name,
            "stream": stream,
            "messages": messages,
        }
        if tools:
            payload["tools"] = tools
        if thinking_budget_tokens is not None:
            payload["thinking"] = {
                "type": "enabled",
                "budget_tokens": thinking_budget_tokens,
            }
        return self._create_completion(payload, retries=retries)

    @staticmethod
    def _as_assistant_tool_call(
        tool_call: dict[str, Any],
        fallback_index: int,
    ) -> dict[str, Any]:
        call_id = tool_call.get("id")
        normalized_call_id = call_id.strip() if isinstance(call_id, str) else ""
        if not normalized_call_id:
            normalized_call_id = f"call_{fallback_index}"

        name = tool_call.get("name")
        normalized_name = name.strip() if isinstance(name, str) else ""

        raw_arguments = tool_call.get("raw_arguments")
        if not isinstance(raw_arguments, str) or not raw_arguments.strip():
            arguments = tool_call.get("arguments", {})
            if not isinstance(arguments, dict):
                arguments = {}
            raw_arguments = json.dumps(arguments, ensure_ascii=True)

        return {
            "id": normalized_call_id,
            "type": "function",
            "function": {
                "name": normalized_name,
                "arguments": raw_arguments,
            },
        }

    def _build_assistant_tool_message(
        self,
        response_text: str,
        tool_calls: list[dict[str, Any]],
    ) -> dict[str, Any]:
        return {
            "role": "assistant",
            "content": response_text,
            "tool_calls": [
                self._as_assistant_tool_call(tool_call, idx)
                for idx, tool_call in enumerate(tool_calls, start=1)
            ],
        }

    @staticmethod
    def _build_tool_messages(tool_responses: list[dict[str, Any]]) -> list[dict[str, str]]:
        messages: list[dict[str, str]] = []
        for idx, item in enumerate(tool_responses, start=1):
            if not isinstance(item, dict):
                continue

            tool_call_id = item.get("tool_call_id")
            normalized_tool_call_id = tool_call_id.strip() if isinstance(tool_call_id, str) else ""
            if not normalized_tool_call_id:
                normalized_tool_call_id = f"call_{idx}"

            payload = item.get("response")
            if isinstance(payload, str):
                content = payload
            else:
                try:
                    content = json.dumps(payload, ensure_ascii=True)
                except TypeError:
                    content = json.dumps({"status": "error", "error": "Unserializable tool response"})

            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": normalized_tool_call_id,
                    "content": content,
                }
            )

        return messages

    def chat(
        self,
        user_message: str,
        system_prompt: str = "You are a helpful assistant for UrbanTrace.",
        stream: bool = True,
        model: str | None = None,
        thinking_budget_tokens: int | None = None,
        retries: int = 2,
        dashboard_nodes: list[dict[str, Any]] | None = None,
        dashboard_edges: list[dict[str, Any]] | None = None,
        tools: list[dict[str, Any]] | None = None,
    ) -> Any:
        """
        Create a Portkey chat completion with dataset + live dashboard context.
        """
        if dashboard_nodes is not None or dashboard_edges is not None:
            self.set_dashboard_state(
                nodes=dashboard_nodes if dashboard_nodes is not None else self.dashboard_state.get("nodes", []),
                edges=dashboard_edges if dashboard_edges is not None else self.dashboard_state.get("edges", []),
            )

        messages = self._build_messages(
            user_message=user_message,
            system_prompt=system_prompt,
            include_tool_guidance=bool(tools),
        )

        return self._complete_messages(
            messages=messages,
            stream=stream,
            model=model,
            thinking_budget_tokens=thinking_budget_tokens,
            retries=retries,
            tools=tools,
        )

    def generate_post_tool_response(
        self,
        original_user_message: str,
        system_prompt: str,
        tool_calls: list[dict[str, Any]],
        tool_responses: list[dict[str, Any]],
        model: str | None = None,
        thinking_budget_tokens: int | None = None,
        retries: int = 2,
    ) -> str:
        """
        Generate final assistant text after tool calls are selected/executed.
        This avoids empty/null assistant content on the first tool-call turn.
        """
        tool_trace = {
            "tool_calls": tool_calls,
            "tool_responses": tool_responses,
        }
        followup_user_message = (
            f"Original user request:\n{original_user_message}\n\n"
            "The tool calls and tool responses were already executed as follows:\n"
            f"{json.dumps(tool_trace, ensure_ascii=True)}\n\n"
            "Now provide the final reply to the user in 1-3 concise sentences. "
            "Explain what was done and why. Do not emit tool calls."
        )

        messages = self._build_messages(
            user_message=followup_user_message,
            system_prompt=system_prompt,
            include_tool_guidance=False,
        )
        response = self._complete_messages(
            messages=messages,
            stream=False,
            model=model,
            thinking_budget_tokens=thinking_budget_tokens,
            retries=retries,
            tools=None,
        )
        return self.extract_response_text(response).strip()

    def run_copilot_turn(
        self,
        user_message: str,
        system_prompt: str = "You are a helpful assistant for UrbanTrace.",
        model: str | None = None,
        thinking_budget_tokens: int | None = None,
        retries: int = 2,
        dashboard_nodes: list[dict[str, Any]] | None = None,
        dashboard_edges: list[dict[str, Any]] | None = None,
        tools: list[dict[str, Any]] | None = None,
        max_tool_rounds: int = 3,
    ) -> dict[str, Any]:
        """
        Execute one copilot user turn with iterative tool-calling.
        Supports multiple tool rounds by feeding tool responses back to the model.
        """
        if dashboard_nodes is not None or dashboard_edges is not None:
            self.set_dashboard_state(
                nodes=dashboard_nodes if dashboard_nodes is not None else self.dashboard_state.get("nodes", []),
                edges=dashboard_edges if dashboard_edges is not None else self.dashboard_state.get("edges", []),
            )

        messages = self._build_messages(
            user_message=user_message,
            system_prompt=system_prompt,
            include_tool_guidance=bool(tools),
        )

        effective_round_limit = max(1, max_tool_rounds)
        all_tool_calls: list[dict[str, Any]] = []
        all_tool_responses: list[dict[str, Any]] = []
        all_actions: list[dict[str, Any]] = []
        seen_action_keys: set[str] = set()

        assistant_initial_response = ""
        assistant_final_response = ""
        rounds_executed = 0
        tool_round_limit_reached = False

        for round_index in range(1, effective_round_limit + 1):
            rounds_executed = round_index
            round_response = self._complete_messages(
                messages=messages,
                stream=False,
                model=model,
                thinking_budget_tokens=thinking_budget_tokens,
                retries=retries,
                tools=tools,
            )

            round_text = self.extract_response_text(round_response).strip()
            if round_index == 1:
                assistant_initial_response = round_text

            round_tool_calls = self.extract_tool_calls(round_response)
            if not round_tool_calls:
                assistant_final_response = round_text
                break

            all_tool_calls.extend(round_tool_calls)

            round_tool_responses = build_tool_responses_from_tool_calls(round_tool_calls)
            all_tool_responses.extend(round_tool_responses)

            round_actions = build_frontend_actions_from_tool_calls(round_tool_calls)
            for action in round_actions:
                dedupe_key = json.dumps(action, sort_keys=True, ensure_ascii=True)
                if dedupe_key in seen_action_keys:
                    continue
                seen_action_keys.add(dedupe_key)
                all_actions.append(action)

            if round_index >= effective_round_limit:
                tool_round_limit_reached = True
                break

            messages.append(self._build_assistant_tool_message(round_text, round_tool_calls))
            messages.extend(self._build_tool_messages(round_tool_responses))

        if not assistant_final_response and all_tool_calls:
            assistant_final_response = self.generate_post_tool_response(
                original_user_message=user_message,
                system_prompt=system_prompt,
                tool_calls=all_tool_calls,
                tool_responses=all_tool_responses,
                model=model,
                thinking_budget_tokens=thinking_budget_tokens,
                retries=retries,
            )

        if not assistant_final_response:
            if all_actions:
                action_count = len(all_actions)
                noun = "action" if action_count == 1 else "actions"
                assistant_final_response = f"Queued {action_count} frontend {noun}."
            else:
                assistant_final_response = "I reviewed your request and I am ready for the next step."

        return {
            "message": assistant_final_response,
            "assistant_initial_response": assistant_initial_response,
            "tool_calls": all_tool_calls,
            "tool_responses": all_tool_responses,
            "actions": all_actions,
            "rounds_executed": rounds_executed,
            "tool_round_limit_reached": tool_round_limit_reached,
        }

    @staticmethod
    def iter_stream_text(stream_response: Any):
        """Yield text chunks from a streamed Portkey/OpenAI response."""
        for chunk in stream_response:
            choices = getattr(chunk, "choices", None)
            if not choices:
                continue

            delta = getattr(choices[0], "delta", None)
            if delta is None:
                continue

            content = getattr(delta, "content", None)
            if isinstance(content, str):
                yield content
            elif isinstance(content, list):
                for part in content:
                    if isinstance(part, dict):
                        text = part.get("text")
                    else:
                        text = getattr(part, "text", None)
                    if text:
                        yield text

            # Some providers place content in model_extra/content_blocks.
            model_extra = getattr(delta, "model_extra", {}) or {}
            content_blocks = model_extra.get("content_blocks", [])
            if isinstance(content_blocks, list):
                for block in content_blocks:
                    if isinstance(block, dict):
                        text = block.get("text")
                        if text:
                            yield text

    @staticmethod
    def extract_response_text(response: Any) -> str:
        """Extract assistant text from a non-stream response object."""
        choices = getattr(response, "choices", None)
        if not choices:
            return ""

        message = getattr(choices[0], "message", None)
        if message is None:
            return ""

        content = getattr(message, "content", "")
        if content is None:
            return ""
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts: list[str] = []
            for item in content:
                if isinstance(item, dict):
                    text = item.get("text")
                else:
                    text = getattr(item, "text", None)
                if text:
                    parts.append(text)
            return "".join(parts)
        return str(content) if content is not None else ""

    @staticmethod
    def extract_tool_calls(response: Any) -> list[dict[str, Any]]:
        """
        Extract function tool calls from a non-stream response object.
        """
        choices = getattr(response, "choices", None)
        if not choices:
            return []

        message = getattr(choices[0], "message", None)
        if message is None:
            return []

        tool_calls = getattr(message, "tool_calls", None) or []
        extracted: list[dict[str, Any]] = []

        for idx, tool_call in enumerate(tool_calls, start=1):
            function_data = getattr(tool_call, "function", None)
            if function_data is None:
                continue

            raw_arguments = getattr(function_data, "arguments", "{}") or "{}"
            try:
                arguments = json.loads(raw_arguments) if raw_arguments else {}
            except json.JSONDecodeError:
                arguments = {}

            extracted.append(
                {
                    "id": getattr(tool_call, "id", "") or f"call_{idx}",
                    "name": getattr(function_data, "name", ""),
                    "arguments": arguments,
                    "raw_arguments": raw_arguments,
                }
            )

        return extracted
