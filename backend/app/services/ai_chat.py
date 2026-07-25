from __future__ import annotations

import json
from datetime import datetime
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.core.config import Settings, get_settings
from app.core.logging import get_logger
from app.services.analyst import answer_report_question as answer_report_question_locally


logger = get_logger(__name__)


SYSTEM_PROMPT = """Voce e o SmartReports AI, um analista de dados e negocios dentro de um SaaS.

Use apenas o contexto do relatorio enviado pelo backend. Nao invente numeros, clientes,
produtos ou causas que nao estejam no contexto. Quando os dados forem insuficientes,
diga exatamente o que falta para responder com seguranca.

Responda em portugues do Brasil, com tom executivo, claro e acionavel.

Retorne somente JSON valido neste formato:
{
  "answer": "resposta completa para o usuario",
  "confidence": "baixa | media | alta",
  "evidence": [
    {"label": "nome da evidencia", "value": "valor", "detail": "por que isso importa"}
  ],
  "next_steps": ["acao recomendada 1", "acao recomendada 2"]
}
"""


class OpenAIChatError(RuntimeError):
    pass


class OpenAIHTTPError(OpenAIChatError):
    def __init__(self, status_code: int, body: str) -> None:
        super().__init__(f"OpenAI HTTP {status_code}: {body[:300]}")
        self.status_code = status_code
        self.body = body


def answer_report_question_with_ai(question: str, report: Any) -> dict[str, Any]:
    settings = get_settings()
    if not settings.openai_api_key:
        return _fallback_answer(question, report, "OPENAI_API_KEY nao configurada.")

    context = _build_report_context(report, settings.openai_max_context_chars)

    try:
        raw_answer, usage = _call_openai(settings, question, context)
        response = _normalize_ai_response(raw_answer)
        if not response["answer"]:
            raise OpenAIChatError("Resposta vazia da OpenAI.")
        response["evidence"] = _merge_usage_evidence(response["evidence"], usage)
        return response
    except OpenAIChatError as exc:
        logger.warning(
            "openai_chat_failed",
            extra={"report_id": getattr(report, "id", None), "reason": str(exc)},
        )
        return _fallback_answer(question, report, "OpenAI indisponivel no momento.")


def _call_openai(settings: Settings, question: str, context: str) -> tuple[str, dict[str, Any]]:
    try:
        return _call_responses_api(settings, question, context)
    except OpenAIHTTPError as exc:
        if exc.status_code not in {400, 404, 422}:
            raise
        logger.warning("openai_responses_api_fallback", extra={"reason": str(exc)})
        return _call_chat_completions_api(settings, question, context)


def _call_responses_api(settings: Settings, question: str, context: str) -> tuple[str, dict[str, Any]]:
    payload: dict[str, Any] = {
        "model": settings.openai_model,
        "input": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": _build_user_prompt(question, context)},
        ],
        "max_output_tokens": settings.openai_max_output_tokens,
    }
    if settings.openai_reasoning_effort:
        payload["reasoning"] = {"effort": settings.openai_reasoning_effort}

    data = _post_openai_json(settings, "/responses", payload)
    return _extract_response_text(data), _extract_usage(data)


def _call_chat_completions_api(settings: Settings, question: str, context: str) -> tuple[str, dict[str, Any]]:
    payload: dict[str, Any] = {
        "model": settings.openai_model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": _build_user_prompt(question, context)},
        ],
    }
    data = _post_openai_json(settings, "/chat/completions", payload)
    return _extract_chat_completion_text(data), _extract_usage(data)


def _post_openai_json(settings: Settings, path: str, payload: dict[str, Any]) -> dict[str, Any]:
    url = f"{settings.openai_base_url.rstrip('/')}{path}"
    body = json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")
    request = Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {settings.openai_api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )

    try:
        with urlopen(request, timeout=settings.openai_request_timeout_seconds) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        body_text = exc.read().decode("utf-8", errors="replace")
        raise OpenAIHTTPError(exc.code, body_text) from exc
    except URLError as exc:
        raise OpenAIChatError(f"Falha de rede ao chamar OpenAI: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise OpenAIChatError("OpenAI retornou JSON invalido.") from exc


def _build_user_prompt(question: str, context: str) -> str:
    return (
        "Pergunta do usuario:\n"
        f"{question.strip()}\n\n"
        "Contexto JSON do relatorio:\n"
        f"{context}\n\n"
        "Analise os dados como um consultor de negocios. Use os numeros disponiveis, "
        "cite evidencias e recomende proximos passos praticos."
    )


def _build_report_context(report: Any, max_chars: int) -> str:
    analysis_summary = report.analysis_summary or {}
    columns_schema = report.columns_schema or {}
    analyst_report = analysis_summary.get("analyst_report") or {}

    context = {
        "report": {
            "id": getattr(report, "id", None),
            "title": getattr(report, "title", None),
            "filename": getattr(report, "filename", None),
            "source_sheet": getattr(report, "source_sheet", None),
            "created_at": _serialize_datetime(getattr(report, "created_at", None)),
        },
        "schema": _summarize_schema(columns_schema),
        "summary": {
            "row_count": analysis_summary.get("row_count"),
            "column_count": analysis_summary.get("column_count"),
            "missing_cells": analysis_summary.get("missing_cells"),
            "quality_score": analysis_summary.get("quality_score"),
            "summary_cards": _limit_list(analysis_summary.get("summary_cards"), 10),
        },
        "charts": _summarize_charts(analysis_summary.get("charts") or []),
        "smart_analyst": _summarize_analyst_report(analyst_report),
        "existing_insight_text": getattr(report, "insight_text", None),
    }

    encoded = json.dumps(context, ensure_ascii=False, default=str)
    if len(encoded) <= max_chars:
        return encoded

    compact_context = {
        **context,
        "schema": {
            **context["schema"],
            "columns": context["schema"].get("columns", [])[:8],
        },
        "charts": context["charts"][:4],
        "smart_analyst": {
            key: _limit_list(value, 5) if isinstance(value, list) else value
            for key, value in context["smart_analyst"].items()
        },
    }
    encoded = json.dumps(compact_context, ensure_ascii=False, default=str)
    return encoded[:max_chars]


def _summarize_schema(schema: dict[str, Any]) -> dict[str, Any]:
    columns = []
    for profile in schema.get("columns", [])[:14]:
        columns.append(
            {
                "name": profile.get("name"),
                "type": profile.get("type"),
                "missing_count": profile.get("missing_count"),
                "missing_ratio": profile.get("missing_ratio"),
                "unique_count": profile.get("unique_count"),
                "sample_values": _limit_list(profile.get("sample_values"), 4),
                "stats": profile.get("stats"),
                "top_values": _limit_list(profile.get("top_values"), 6),
            }
        )
    return {
        "row_count": schema.get("row_count"),
        "column_count": schema.get("column_count"),
        "types": schema.get("types"),
        "columns": columns,
    }


def _summarize_charts(charts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    summarized = []
    for chart in charts[:8]:
        item = {
            "id": chart.get("id"),
            "type": chart.get("type"),
            "title": chart.get("title"),
            "xLabel": chart.get("xLabel"),
            "yLabel": chart.get("yLabel"),
        }
        if "x" in chart and "y" in chart:
            item["x"] = _head_tail(chart.get("x"), 6)
            item["y"] = _head_tail(chart.get("y"), 6)
        if "labels" in chart and "values" in chart:
            item["labels"] = _limit_list(chart.get("labels"), 10)
            item["values"] = _limit_list(chart.get("values"), 10)
        summarized.append(item)
    return summarized


def _summarize_analyst_report(analyst_report: dict[str, Any]) -> dict[str, Any]:
    keys = (
        "mode",
        "confidence_score",
        "executive_summary",
        "kpis",
        "findings",
        "risks",
        "opportunities",
        "recommendations",
        "action_plan",
        "segment_analysis",
        "talking_points",
        "watchouts",
        "decisions_needed",
        "conclusion",
    )
    summarized: dict[str, Any] = {}
    for key in keys:
        value = analyst_report.get(key)
        if isinstance(value, list):
            summarized[key] = _limit_list(value, 8)
        elif value is not None:
            summarized[key] = value
    return summarized


def _extract_response_text(data: dict[str, Any]) -> str:
    output_text = data.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text

    parts: list[str] = []
    for item in data.get("output", []) or []:
        for content in item.get("content", []) or []:
            text = content.get("text")
            if isinstance(text, str):
                parts.append(text)
    if parts:
        return "\n".join(parts)
    raise OpenAIChatError("OpenAI nao retornou texto.")


def _extract_chat_completion_text(data: dict[str, Any]) -> str:
    choices = data.get("choices") or []
    if not choices:
        raise OpenAIChatError("Chat Completions nao retornou escolhas.")
    message = choices[0].get("message") or {}
    content = message.get("content")
    if isinstance(content, str) and content.strip():
        return content
    raise OpenAIChatError("Chat Completions nao retornou texto.")


def _normalize_ai_response(raw_text: str) -> dict[str, Any]:
    parsed = _parse_json_object(raw_text)
    if parsed is None:
        return {
            "answer": raw_text.strip(),
            "confidence": "media",
            "evidence": [],
            "next_steps": [],
        }

    answer = str(parsed.get("answer") or parsed.get("resposta") or "").strip()
    confidence = _normalize_confidence(parsed.get("confidence") or parsed.get("confianca"))
    evidence = _normalize_evidence(parsed.get("evidence") or parsed.get("evidencias") or [])
    next_steps = [
        str(step).strip()
        for step in (parsed.get("next_steps") or parsed.get("proximos_passos") or [])
        if str(step).strip()
    ][:6]

    return {
        "answer": answer,
        "confidence": confidence,
        "evidence": evidence,
        "next_steps": next_steps,
    }


def _parse_json_object(raw_text: str) -> dict[str, Any] | None:
    text = raw_text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:].strip()

    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            return None
        try:
            parsed = json.loads(text[start : end + 1])
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            return None


def _normalize_confidence(value: Any) -> str:
    text = str(value or "media").strip().lower()
    mapping = {
        "low": "baixa",
        "baixa": "baixa",
        "medium": "media",
        "media": "media",
        "medio": "media",
        "alta": "alta",
        "high": "alta",
    }
    return mapping.get(text, "media")


def _normalize_evidence(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    evidence = []
    for item in value[:8]:
        if isinstance(item, dict):
            evidence.append(
                {
                    "label": str(item.get("label") or item.get("titulo") or "Evidencia")[:120],
                    "value": str(item.get("value") or item.get("valor") or "")[:180],
                    "detail": str(item.get("detail") or item.get("detalhe") or "")[:500],
                }
            )
        elif str(item).strip():
            evidence.append({"label": "Evidencia", "value": "", "detail": str(item).strip()[:500]})
    return evidence


def _merge_usage_evidence(evidence: list[dict[str, Any]], usage: dict[str, Any]) -> list[dict[str, Any]]:
    if not usage:
        return evidence
    usage_evidence = {
        "label": "IA",
        "value": "OpenAI",
        "detail": f"Resposta gerada pelo modelo com uso registrado: {usage}.",
    }
    return [*evidence, usage_evidence][:8]


def _extract_usage(data: dict[str, Any]) -> dict[str, Any]:
    usage = data.get("usage")
    return usage if isinstance(usage, dict) else {}


def _fallback_answer(question: str, report: Any, reason: str) -> dict[str, Any]:
    response = answer_report_question_locally(question, report)
    response["evidence"] = [
        {
            "label": "Modo de resposta",
            "value": "Smart Analyst local",
            "detail": reason,
        },
        *(response.get("evidence") or []),
    ][:8]
    return response


def _limit_list(value: Any, limit: int) -> list[Any]:
    if not isinstance(value, list):
        return []
    return value[:limit]


def _head_tail(value: Any, size: int) -> list[Any]:
    if not isinstance(value, list):
        return []
    if len(value) <= size * 2:
        return value
    return [*value[:size], {"gap": len(value) - (size * 2)}, *value[-size:]]


def _serialize_datetime(value: Any) -> str | None:
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value) if value is not None else None
