"""Copilot tool schemas and dashboard serialization helpers."""

from __future__ import annotations

import json
from typing import Any

ADD_DATASET_NODE_TOOL = {
    "type": "function",
    "function": {
        "name": "add_dataset_node",
        "description": (
            "Request the frontend canvas to add a dataset node by dataset id. "
            "Pass dataset_id and optionally color_by. The frontend validates both."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "dataset_id": {
                    "type": "string",
                    "description": (
                        "Dataset id to add (preferred canonical id without '.geojson'). "
                        "Use dataset ids from provided UrbanTrace dataset context."
                    ),
                },
                "color_by": {
                    "type": "string",
                    "description": (
                        "Optional numeric column name to use as the default "
                        "colorBy field for the added dataset node."
                    ),
                }
            },
            "required": ["dataset_id"],
            "additionalProperties": False,
        },
    },
}

COPILOT_FRONTEND_TOOLS = [ADD_DATASET_NODE_TOOL]


def _normalize_dataset_id(name: str | None) -> str:
    if not isinstance(name, str):
        return ""
    dataset_id = name.strip()
    if dataset_id.endswith(".geojson"):
        dataset_id = dataset_id[: -len(".geojson")]
    if dataset_id.endswith("_metadata"):
        dataset_id = dataset_id[: -len("_metadata")]
    return dataset_id


def _get_node_display_label(node: dict[str, Any]) -> str:
    data = node.get("data", {}) if isinstance(node, dict) else {}
    if not isinstance(data, dict):
        data = {}

    return (
        data.get("label")
        or data.get("name")
        or data.get("filename")
        or data.get("id")
        or node.get("id", "unknown")
    )


def _resolve_dataset_description(
    data: dict[str, Any],
    metadata: dict[str, Any],
    descriptions_by_dataset: dict[str, str],
) -> str:
    for description in (data.get("description"), metadata.get("description")):
        if isinstance(description, str) and description.strip():
            return description.strip()

    candidates = (
        data.get("id"),
        data.get("filename"),
        data.get("name"),
        metadata.get("name"),
    )
    for raw_id in candidates:
        dataset_id = _normalize_dataset_id(raw_id)
        if not dataset_id:
            continue
        description = descriptions_by_dataset.get(dataset_id)
        if description:
            return description

    return "No description available. Refer to dataset context for profile details."


def summarize_dashboard_state(
    dashboard_state: dict[str, list[dict[str, Any]]],
    descriptions_by_dataset: dict[str, str] | None = None,
) -> dict[str, Any]:
    descriptions_by_dataset = descriptions_by_dataset or {}

    nodes = dashboard_state.get("nodes", [])
    edges = dashboard_state.get("edges", [])
    node_index = {
        node.get("id"): node
        for node in nodes
        if isinstance(node, dict) and node.get("id")
    }

    dataset_nodes: list[dict[str, Any]] = []
    integration_nodes: list[dict[str, Any]] = []
    other_nodes: list[dict[str, Any]] = []

    for node in nodes:
        if not isinstance(node, dict):
            continue
        node_type = node.get("type", "unknown")
        node_id = node.get("id", "unknown")
        data = node.get("data", {})
        if not isinstance(data, dict):
            data = {}

        if node_type == "datasetNode":
            metadata = data.get("metadata", {})
            if not isinstance(metadata, dict):
                metadata = {}

            dataset_summary: dict[str, Any] = {
                "node_id": node_id,
                "dataset_id": metadata.get("name") or data.get("name"),
                "color_by": data.get("colorBy", "").strip(),
                "geometry_type": metadata.get("geometricType"),
                "columns": metadata.get("columns", []),
                "description": _resolve_dataset_description(
                    data=data,
                    metadata=metadata,
                    descriptions_by_dataset=descriptions_by_dataset,
                ),
            }

            dataset_nodes.append(dataset_summary)
        elif node_type == "integrationNode":
            integration_nodes.append(
                {
                    "node_id": node_id,
                    "label": data.get("label"),
                    "connected_source_dataset": data.get("connectedDatasetFilename"),
                    "connected_zone_dataset": data.get("connectedZoneFilename"),
                }
            )
        else:
            other_nodes.append(
                {
                    "node_id": node_id,
                    "node_type": node_type,
                    "label": _get_node_display_label(node),
                }
            )

    connections: list[dict[str, Any]] = []
    for edge in edges:
        if not isinstance(edge, dict):
            continue
        source_id = edge.get("source")
        target_id = edge.get("target")
        source_node = node_index.get(source_id, {})
        target_node = node_index.get(target_id, {})
        source_data = source_node.get("data", {}) if isinstance(source_node, dict) else {}
        target_data = target_node.get("data", {}) if isinstance(target_node, dict) else {}

        if not isinstance(source_data, dict):
            source_data = {}
        if not isinstance(target_data, dict):
            target_data = {}

        connections.append(
            {
                "edge_id": edge.get("id"),
                "source_node_id": source_id,
                "source_node_type": source_node.get("type") if isinstance(source_node, dict) else None,
                "source_label": _get_node_display_label(source_node) if source_node else source_id,
                "source_filename": source_data.get("filename"),
                "source_handle": edge.get("sourceHandle"),
                "target_node_id": target_id,
                "target_node_type": target_node.get("type") if isinstance(target_node, dict) else None,
                "target_label": _get_node_display_label(target_node) if target_node else target_id,
                "target_filename": target_data.get("filename"),
                "target_handle": edge.get("targetHandle"),
            }
        )

    return {
        "node_count": len(nodes),
        "edge_count": len(edges),
        "dataset_nodes": dataset_nodes,
        "integration_nodes": integration_nodes,
        "other_nodes": other_nodes,
        "connections": connections,
    }


def get_dashboard_snapshot_json(
    dashboard_state: dict[str, list[dict[str, Any]]],
    descriptions_by_dataset: dict[str, str] | None = None,
) -> str:
    snapshot = summarize_dashboard_state(
        dashboard_state=dashboard_state,
        descriptions_by_dataset=descriptions_by_dataset,
    )
    return json.dumps(snapshot, ensure_ascii=True)


def build_tool_responses_from_tool_calls(tool_calls: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Convert model tool calls into tool response payloads (1:1 with calls).
    These are fed back to the model and can also be logged for debugging.
    """
    tool_responses: list[dict[str, Any]] = []

    for call in tool_calls:
        if not isinstance(call, dict):
            continue

        call_id = call.get("id", "")
        name = call.get("name", "")
        args = call.get("arguments", {})
        if not isinstance(args, dict):
            args = {}

        if name != "add_dataset_node":
            response_payload: dict[str, Any] = {
                "status": "ignored",
                "error": f"Unsupported tool: {name}",
            }
        else:
            dataset_id = _normalize_dataset_id(args.get("dataset_id"))
            if not dataset_id:
                response_payload = {
                    "status": "error",
                    "error": "Invalid dataset_id",
                }
            else:
                response_payload = {
                    "type": "add_dataset_node",
                    "datasetId": dataset_id,
                }
                color_by = args.get("color_by")
                normalized_color_by = color_by.strip() if isinstance(color_by, str) else ""
                if normalized_color_by:
                    response_payload["colorBy"] = normalized_color_by

        tool_responses.append(
            {
                "tool_call_id": call_id,
                "name": name,
                "response": response_payload,
            }
        )

    return tool_responses


def build_frontend_actions_from_tool_calls(tool_calls: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Convert model tool calls into frontend actions.
    """
    actions: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()

    for item in build_tool_responses_from_tool_calls(tool_calls):
        if not isinstance(item, dict):
            continue
        response = item.get("response", {})
        if not isinstance(response, dict):
            continue
        if response.get("type") != "add_dataset_node":
            continue

        dataset_id = response.get("datasetId")
        if not isinstance(dataset_id, str) or not dataset_id:
            continue

        color_by = response.get("colorBy")
        normalized_color_by = color_by.strip() if isinstance(color_by, str) else ""
        dedupe_key = ("add_dataset_node", dataset_id, normalized_color_by)
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)

        action: dict[str, Any] = {
            "type": "add_dataset_node",
            "datasetId": dataset_id,
        }
        if normalized_color_by:
            action["colorBy"] = normalized_color_by
        actions.append(action)

    return actions
