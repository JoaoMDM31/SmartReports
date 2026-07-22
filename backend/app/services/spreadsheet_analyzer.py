from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from io import BytesIO
from pathlib import Path
from typing import Any

import pandas as pd

from app.services.analyst import build_analyst_report


@dataclass
class LoadedSpreadsheet:
    dataframe: pd.DataFrame
    sheet_name: str | None


def analyze_spreadsheet(file_bytes: bytes, filename: str) -> dict[str, Any]:
    loaded = _load_dataframe(file_bytes, filename)
    df = _normalize_columns(loaded.dataframe).dropna(how="all").dropna(axis=1, how="all")

    if df.empty:
        raise ValueError("A planilha nao possui dados tabulares validos.")

    profiles = [_profile_column(df[column]) for column in df.columns]
    schema = {
        "columns": profiles,
        "row_count": int(len(df)),
        "column_count": int(len(df.columns)),
        "types": _count_types(profiles),
    }

    summary_cards = _build_summary_cards(df, profiles)
    charts = _build_chart_specs(df, profiles)
    analyst_report = build_analyst_report(df, profiles, summary_cards, charts)
    insights = _build_insights(df, profiles, summary_cards, analyst_report)

    return {
        "source_sheet": loaded.sheet_name,
        "schema": schema,
        "summary": {
            "row_count": int(len(df)),
            "column_count": int(len(df.columns)),
            "missing_cells": int(df.isna().sum().sum()),
            "quality_score": _quality_score(df),
            "summary_cards": summary_cards,
            "charts": charts,
            "analyst_report": analyst_report,
        },
        "insights": insights,
    }


def _load_dataframe(file_bytes: bytes, filename: str) -> LoadedSpreadsheet:
    suffix = Path(filename).suffix.lower()
    buffer = BytesIO(file_bytes)

    if suffix == ".csv":
        return LoadedSpreadsheet(pd.read_csv(buffer), None)

    if suffix not in {".xls", ".xlsx", ".xlsm"}:
        raise ValueError("Formato nao suportado. Envie .xlsx, .xlsm, .xls ou .csv.")

    workbook = pd.ExcelFile(buffer)
    sheet_name = workbook.sheet_names[0]
    return LoadedSpreadsheet(workbook.parse(sheet_name), sheet_name)


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    normalized = df.copy()
    names: list[str] = []
    seen: dict[str, int] = {}

    for index, column in enumerate(normalized.columns, start=1):
        name = str(column).strip()
        if not name or name.lower().startswith("unnamed"):
            name = f"Coluna {index}"
        if name in seen:
            seen[name] += 1
            name = f"{name} {seen[name]}"
        else:
            seen[name] = 1
        names.append(name)

    normalized.columns = names
    return normalized


def _profile_column(series: pd.Series) -> dict[str, Any]:
    clean = series.dropna()
    inferred_type = _infer_type(series)
    profile: dict[str, Any] = {
        "name": str(series.name),
        "type": inferred_type,
        "missing_count": int(series.isna().sum()),
        "missing_ratio": round(float(series.isna().mean() or 0), 4),
        "unique_count": int(clean.nunique(dropna=True)),
        "sample_values": [_to_json_safe(value) for value in clean.head(4).tolist()],
    }

    if inferred_type == "numeric":
        numeric = pd.to_numeric(series, errors="coerce").dropna()
        profile["stats"] = {
            "min": _round_or_none(numeric.min()),
            "max": _round_or_none(numeric.max()),
            "mean": _round_or_none(numeric.mean()),
            "sum": _round_or_none(numeric.sum()),
        }
    elif inferred_type == "date":
        dates = pd.to_datetime(series, errors="coerce").dropna()
        profile["stats"] = {
            "min": dates.min().date().isoformat() if not dates.empty else None,
            "max": dates.max().date().isoformat() if not dates.empty else None,
        }
    else:
        top_values = clean.astype(str).value_counts().head(5)
        profile["top_values"] = [
            {"label": _truncate(label), "count": int(count)}
            for label, count in top_values.items()
        ]

    return profile


def _infer_type(series: pd.Series) -> str:
    clean = series.dropna()
    if clean.empty:
        return "empty"

    if pd.api.types.is_bool_dtype(clean):
        return "boolean"

    if pd.api.types.is_datetime64_any_dtype(clean):
        return "date"

    native_date_ratio = float(
        clean.map(lambda value: isinstance(value, (datetime, date, pd.Timestamp))).mean()
    )
    if native_date_ratio >= 0.8:
        return "date"

    numeric = pd.to_numeric(clean, errors="coerce")
    numeric_ratio = float(numeric.notna().mean())
    if pd.api.types.is_numeric_dtype(clean) or numeric_ratio >= 0.85:
        return "numeric"

    if _has_date_like_strings(clean):
        dates = pd.to_datetime(clean, errors="coerce")
        date_ratio = float(dates.notna().mean())
        if date_ratio >= 0.8:
            return "date"

    unique_count = clean.nunique(dropna=True)
    if unique_count <= max(12, int(len(clean) * 0.25)):
        return "categorical"

    return "text"


def _has_date_like_strings(series: pd.Series) -> bool:
    sample = series.astype(str).head(25)
    markers = ("-", "/", ".")
    date_like = sample.map(lambda value: any(marker in value for marker in markers))
    return bool(date_like.mean() >= 0.6)


def _count_types(profiles: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for profile in profiles:
        counts[profile["type"]] = counts.get(profile["type"], 0) + 1
    return counts


def _quality_score(df: pd.DataFrame) -> int:
    total_cells = max(int(df.shape[0] * df.shape[1]), 1)
    missing_ratio = float(df.isna().sum().sum()) / total_cells
    duplicate_penalty = min(float(df.duplicated().mean() or 0), 0.3)
    score = 100 - (missing_ratio * 70) - (duplicate_penalty * 30)
    return max(0, min(100, round(score)))


def _build_summary_cards(df: pd.DataFrame, profiles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    cards = [
        {"label": "Linhas analisadas", "value": int(len(df)), "kind": "neutral"},
        {"label": "Colunas detectadas", "value": int(len(df.columns)), "kind": "neutral"},
        {"label": "Qualidade dos dados", "value": f"{_quality_score(df)}%", "kind": "success"},
        {"label": "Campos vazios", "value": int(df.isna().sum().sum()), "kind": "warning"},
    ]

    numeric_profiles = [profile for profile in profiles if profile["type"] == "numeric"]
    for profile in numeric_profiles[:4]:
        stats = profile.get("stats", {})
        cards.append(
            {
                "label": f"Soma de {profile['name']}",
                "value": _compact_number(stats.get("sum")),
                "detail": f"Media: {_compact_number(stats.get('mean'))}",
                "kind": "accent",
            }
        )

    return cards[:8]


def _build_chart_specs(df: pd.DataFrame, profiles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    numeric_columns = [profile["name"] for profile in profiles if profile["type"] == "numeric"]
    date_columns = [profile["name"] for profile in profiles if profile["type"] == "date"]
    categorical_columns = [
        profile["name"] for profile in profiles if profile["type"] in {"categorical", "boolean"}
    ]

    charts: list[dict[str, Any]] = []

    if date_columns and numeric_columns:
        date_col, metric_col = date_columns[0], numeric_columns[0]
        chart_df = df[[date_col, metric_col]].copy()
        chart_df[date_col] = pd.to_datetime(chart_df[date_col], errors="coerce")
        chart_df[metric_col] = pd.to_numeric(chart_df[metric_col], errors="coerce")
        chart_df = chart_df.dropna().sort_values(date_col)
        if not chart_df.empty:
            grouped = chart_df.groupby(pd.Grouper(key=date_col, freq="D"))[metric_col].sum().tail(120)
            charts.append(
                {
                    "id": "trend",
                    "type": "line",
                    "title": f"Tendencia de {metric_col} por {date_col}",
                    "x": [index.date().isoformat() for index in grouped.index],
                    "y": [_round_or_none(value) for value in grouped.values],
                    "xLabel": date_col,
                    "yLabel": metric_col,
                }
            )

    if categorical_columns and numeric_columns:
        category_col, metric_col = categorical_columns[0], numeric_columns[0]
        chart_df = df[[category_col, metric_col]].copy()
        chart_df[metric_col] = pd.to_numeric(chart_df[metric_col], errors="coerce")
        chart_df[category_col] = chart_df[category_col].fillna("Sem categoria").astype(str)
        grouped = (
            chart_df.dropna(subset=[metric_col])
            .groupby(category_col)[metric_col]
            .sum()
            .sort_values(ascending=False)
            .head(10)
        )
        if not grouped.empty:
            charts.append(
                {
                    "id": "category-bar",
                    "type": "bar",
                    "title": f"Top categorias por {metric_col}",
                    "x": [_truncate(index) for index in grouped.index],
                    "y": [_round_or_none(value) for value in grouped.values],
                    "xLabel": category_col,
                    "yLabel": metric_col,
                }
            )

    if categorical_columns:
        category_col = categorical_columns[0]
        counts = df[category_col].fillna("Sem categoria").astype(str).value_counts().head(8)
        if not counts.empty:
            charts.append(
                {
                    "id": "category-share",
                    "type": "pie",
                    "title": f"Distribuicao de {category_col}",
                    "labels": [_truncate(index) for index in counts.index],
                    "values": [int(value) for value in counts.values],
                }
            )

    if len(numeric_columns) >= 2:
        x_col, y_col = numeric_columns[0], numeric_columns[1]
        scatter_df = df[[x_col, y_col]].copy()
        scatter_df[x_col] = pd.to_numeric(scatter_df[x_col], errors="coerce")
        scatter_df[y_col] = pd.to_numeric(scatter_df[y_col], errors="coerce")
        scatter_df = scatter_df.dropna().head(500)
        if not scatter_df.empty:
            charts.append(
                {
                    "id": "scatter",
                    "type": "scatter",
                    "title": f"Relacao entre {x_col} e {y_col}",
                    "x": [_round_or_none(value) for value in scatter_df[x_col].values],
                    "y": [_round_or_none(value) for value in scatter_df[y_col].values],
                    "xLabel": x_col,
                    "yLabel": y_col,
                }
            )

    if numeric_columns:
        metric_col = numeric_columns[0]
        values = pd.to_numeric(df[metric_col], errors="coerce").dropna().head(1000)
        if not values.empty:
            charts.append(
                {
                    "id": "distribution",
                    "type": "histogram",
                    "title": f"Distribuicao de {metric_col}",
                    "x": [_round_or_none(value) for value in values.values],
                    "xLabel": metric_col,
                }
            )

    return charts[:5]


def _build_insights(
    df: pd.DataFrame,
    profiles: list[dict[str, Any]],
    summary_cards: list[dict[str, Any]],
    analyst_report: dict[str, Any] | None = None,
) -> str:
    if analyst_report and analyst_report.get("executive_summary"):
        conclusion = analyst_report.get("conclusion")
        return " ".join(part for part in [analyst_report["executive_summary"], conclusion] if part)

    row_count = len(df)
    column_count = len(df.columns)
    missing_cells = int(df.isna().sum().sum())
    quality = _quality_score(df)
    insights = [
        f"A base possui {row_count} registros e {column_count} colunas. O score de qualidade estimado e {quality}%.",
    ]

    if missing_cells:
        insights.append(
            f"Foram encontradas {missing_cells} celulas vazias; revisar esses campos pode melhorar a confiabilidade dos indicadores."
        )
    else:
        insights.append("Nao foram encontradas celulas vazias nas colunas analisadas.")

    numeric_profiles = [profile for profile in profiles if profile["type"] == "numeric"]
    if numeric_profiles:
        top_numeric = max(
            numeric_profiles,
            key=lambda profile: abs(float(profile.get("stats", {}).get("sum") or 0)),
        )
        stats = top_numeric.get("stats", {})
        insights.append(
            f"O principal indicador numerico detectado foi {top_numeric['name']}, com soma de {_compact_number(stats.get('sum'))} e media de {_compact_number(stats.get('mean'))}."
        )

    categorical_profiles = [profile for profile in profiles if profile["type"] == "categorical"]
    if categorical_profiles:
        profile = categorical_profiles[0]
        top_value = (profile.get("top_values") or [{}])[0]
        if top_value:
            insights.append(
                f"A categoria mais frequente em {profile['name']} e {top_value.get('label')}, com {top_value.get('count')} ocorrencias."
            )

    if len(summary_cards) >= 4:
        insights.append(
            "O dashboard foi montado automaticamente com KPIs, distribuicoes e comparacoes para acelerar a leitura executiva."
        )

    return " ".join(insights)


def _to_json_safe(value: Any) -> Any:
    if pd.isna(value):
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, (int, float, str, bool)):
        return value
    return str(value)


def _round_or_none(value: Any) -> float | None:
    if value is None or pd.isna(value):
        return None
    return round(float(value), 2)


def _compact_number(value: Any) -> str:
    number = _round_or_none(value)
    if number is None:
        return "-"
    if abs(number) >= 1_000_000:
        return f"{number / 1_000_000:.2f}M"
    if abs(number) >= 1_000:
        return f"{number / 1_000:.2f}k"
    if number.is_integer():
        return str(int(number))
    return f"{number:.2f}"


def _truncate(value: Any, length: int = 40) -> str:
    text = str(value)
    return text if len(text) <= length else f"{text[: length - 1]}..."
