from __future__ import annotations

from typing import Any

import pandas as pd


BUSINESS_METRIC_KEYWORDS = {
    "revenue": ("receita", "faturamento", "venda", "valor", "total", "sales", "revenue"),
    "profit": ("lucro", "profit", "resultado", "ebitda"),
    "cost": ("custo", "cost", "despesa", "expense"),
    "margin": ("margem", "margin", "%", "taxa"),
    "volume": ("unidade", "quantidade", "volume", "clientes", "pedido", "orders", "users"),
}


def build_analyst_report(
    df: pd.DataFrame,
    profiles: list[dict[str, Any]],
    summary_cards: list[dict[str, Any]],
    charts: list[dict[str, Any]],
) -> dict[str, Any]:
    numeric_columns = [profile["name"] for profile in profiles if profile["type"] == "numeric"]
    categorical_columns = [
        profile["name"] for profile in profiles if profile["type"] in {"categorical", "boolean"}
    ]
    date_columns = [profile["name"] for profile in profiles if profile["type"] == "date"]

    metric_roles = _identify_metric_roles(numeric_columns)
    primary_metric = metric_roles.get("revenue") or metric_roles.get("profit") or _largest_numeric(df, numeric_columns)
    profit_metric = metric_roles.get("profit")
    margin_metric = metric_roles.get("margin")

    findings: list[dict[str, Any]] = []
    risks: list[dict[str, Any]] = []
    opportunities: list[dict[str, Any]] = []
    recommendations: list[dict[str, Any]] = []

    executive_summary = _executive_summary(df, profiles, primary_metric)
    kpis = _smart_kpis(df, primary_metric, profit_metric, margin_metric)
    segment_analysis = _segment_analysis(df, categorical_columns, numeric_columns, primary_metric)
    trend = _trend_analysis(df, date_columns, primary_metric)
    anomalies = _detect_anomalies(df, numeric_columns, profiles)

    if trend:
        findings.append(trend)
        _add_trend_recommendation(trend, risks, opportunities, recommendations)

    for segment in segment_analysis[:5]:
        finding = _segment_finding(segment)
        findings.append(finding)
        if segment.get("share", 0) >= 0.4:
            risks.append(
                {
                    "title": f"Concentracao em {segment['dimension']}",
                    "severity": "alta" if segment["share"] >= 0.55 else "media",
                    "detail": (
                        f"{segment['leader']} representa {_pct(segment['share'])} de "
                        f"{segment['metric']}. Isso cria dependencia relevante."
                    ),
                    "evidence": segment,
                }
            )
            recommendations.append(
                {
                    "title": f"Diversificar {segment['dimension']}",
                    "priority": "alta",
                    "detail": (
                        f"Criar plano para reduzir dependencia de {segment['leader']} e ampliar "
                        "participacao dos demais segmentos."
                    ),
                }
            )
        else:
            opportunities.append(
                {
                    "title": f"Expandir segmentos secundarios em {segment['dimension']}",
                    "impact": "medio",
                    "detail": (
                        f"{segment['leader']} lidera, mas a distribuicao permite escalar segmentos "
                        "adjacentes sem alto risco de concentracao."
                    ),
                }
            )

    if anomalies:
        risks.append(
            {
                "title": "Pontos fora do padrao",
                "severity": "media",
                "detail": (
                    f"Foram detectados {len(anomalies)} valores numericos atipicos. "
                    "Revise se sao eventos reais, erros de cadastro ou oportunidades pontuais."
                ),
                "evidence": anomalies[:3],
            }
        )

    data_quality = _data_quality_risks(profiles, len(df))
    risks.extend(data_quality)

    if not recommendations:
        recommendations.append(
            {
                "title": "Transformar achados em rotina de gestao",
                "priority": "media",
                "detail": (
                    "Acompanhar os KPIs principais semanalmente e revisar segmentos com crescimento "
                    "ou queda fora do padrao."
                ),
            }
        )

    action_plan = _action_plan(findings, risks, opportunities, recommendations)
    conclusion = _conclusion(primary_metric, findings, risks, opportunities)

    return {
        "mode": "Smart Analyst",
        "confidence_score": _confidence_score(df, profiles, charts),
        "executive_summary": executive_summary,
        "kpis": kpis,
        "findings": findings[:8],
        "risks": risks[:6],
        "opportunities": opportunities[:6],
        "recommendations": recommendations[:6],
        "action_plan": action_plan,
        "anomalies": anomalies[:8],
        "segment_analysis": segment_analysis[:36],
        "trend_analysis": trend,
        "chart_rationale": _chart_rationale(charts),
        "conclusion": conclusion,
        "director_brief": _director_brief(executive_summary, findings, risks, recommendations),
        "summary_cards": summary_cards,
    }


def answer_report_question(question: str, report: Any) -> dict[str, Any]:
    normalized = question.strip().lower()
    analyst_report = (report.analysis_summary or {}).get("analyst_report") or {}
    segments = analyst_report.get("segment_analysis") or []
    kpis = analyst_report.get("kpis") or []

    if not normalized:
        return _chat_response("Faça uma pergunta sobre o relatorio para eu analisar.", "baixa")

    if any(term in normalized for term in ("resumo", "executivo", "sumario")):
        return _chat_response(
            analyst_report.get("executive_summary") or report.insight_text,
            "alta",
            next_steps=["Baixar PDF executivo", "Revisar riscos", "Priorizar plano de acao"],
        )

    if any(term in normalized for term in ("quem vendeu mais", "maior vendedor", "vendedor")):
        return _answer_dimension(segments, ("vendedor", "seller"), "vendedor", ("receita", "venda", "sales"))

    if any(term in normalized for term in ("regiao", "região")):
        metric_keywords = ("lucro", "profit") if "lucro" in normalized else ("receita", "venda", "sales")
        return _answer_dimension(segments, ("regiao", "região", "region"), "regiao", metric_keywords)

    if any(term in normalized for term in ("produto", "categoria", "descontinuar")):
        response = _answer_dimension(
            segments,
            ("produto", "categoria", "product", "category"),
            "produto",
            ("lucro", "margem", "receita", "profit", "margin", "revenue"),
        )
        if "descontinuar" in normalized:
            response["answer"] += (
                " Para decidir descontinuacao, compare margem, recorrencia e tendencia antes de cortar "
                "apenas pelo volume."
            )
        return response

    if any(term in normalized for term in ("lucro", "margem", "rentabilidade")):
        best = _find_kpi(kpis, ("lucro", "margem", "profit", "margin"))
        if best:
            return _chat_response(
                f"O indicador mais relacionado e {best['label']}: {best['value']}. {best.get('detail', '')}",
                "media",
            )

    if any(term in normalized for term in ("risco", "riscos", "alerta")):
        risks = analyst_report.get("risks") or []
        if risks:
            answer = "Principais riscos: " + " ".join(
                f"{index + 1}. {risk['title']}: {risk['detail']}" for index, risk in enumerate(risks[:3])
            )
            return _chat_response(answer, "alta", next_steps=["Validar causa raiz", "Criar responsavel", "Definir prazo"])

    if any(term in normalized for term in ("fazer", "acao", "ação", "recomenda")):
        actions = analyst_report.get("action_plan") or []
        if actions:
            answer = "Plano recomendado: " + " ".join(
                f"{action['step']}: {action['owner']} deve {action['action']}"
                for action in actions[:4]
            )
            return _chat_response(answer, "alta")

    default_parts = [
        analyst_report.get("executive_summary") or report.insight_text,
        "Posso detalhar por vendedor, regiao, produto, risco, oportunidade ou plano de acao.",
    ]
    return _chat_response(" ".join(part for part in default_parts if part), "media")


def _identify_metric_roles(numeric_columns: list[str]) -> dict[str, str]:
    roles: dict[str, str] = {}
    for role, keywords in BUSINESS_METRIC_KEYWORDS.items():
        for column in numeric_columns:
            column_key = column.lower()
            if any(keyword in column_key for keyword in keywords):
                roles.setdefault(role, column)
    return roles


def _largest_numeric(df: pd.DataFrame, numeric_columns: list[str]) -> str | None:
    if not numeric_columns:
        return None
    totals = {
        column: abs(float(pd.to_numeric(df[column], errors="coerce").fillna(0).sum()))
        for column in numeric_columns
    }
    return max(totals, key=totals.get)


def _executive_summary(
    df: pd.DataFrame, profiles: list[dict[str, Any]], primary_metric: str | None
) -> str:
    quality = _quality_score_from_profiles(profiles)
    if primary_metric:
        metric_values = pd.to_numeric(df[primary_metric], errors="coerce").dropna()
        total = metric_values.sum() if not metric_values.empty else 0
        return (
            f"A base analisada possui {len(df)} registros e {len(df.columns)} colunas. "
            f"O indicador central detectado foi {primary_metric}, totalizando {_money_or_number(total)}. "
            f"A qualidade estimada dos dados e {quality}%, permitindo uma leitura executiva confiavel."
        )
    return (
        f"A base analisada possui {len(df)} registros e {len(df.columns)} colunas. "
        f"A qualidade estimada dos dados e {quality}%, mas nao ha uma metrica numerica evidente."
    )


def _smart_kpis(
    df: pd.DataFrame, primary_metric: str | None, profit_metric: str | None, margin_metric: str | None
) -> list[dict[str, Any]]:
    kpis: list[dict[str, Any]] = [
        {"label": "Registros analisados", "value": len(df), "detail": "Base total", "kind": "neutral"},
    ]
    for label, column, kind in (
        ("Indicador principal", primary_metric, "accent"),
        ("Lucro total", profit_metric, "success"),
        ("Margem media", margin_metric, "warning"),
    ):
        if not column:
            continue
        values = pd.to_numeric(df[column], errors="coerce").dropna()
        if values.empty:
            continue
        if column == margin_metric:
            value = _pct(float(values.mean()))
            detail = f"Mediana: {_pct(float(values.median()))}"
        else:
            value = _money_or_number(values.sum())
            detail = f"Media: {_money_or_number(values.mean())}"
        kpis.append({"label": f"{label}: {column}", "value": value, "detail": detail, "kind": kind})
    return kpis


def _segment_analysis(
    df: pd.DataFrame,
    categorical_columns: list[str],
    numeric_columns: list[str],
    primary_metric: str | None,
) -> list[dict[str, Any]]:
    metrics = [metric for metric in [primary_metric, *_priority_metrics(numeric_columns)] if metric]
    unique_metrics = list(dict.fromkeys(metrics))[:3]
    segments: list[dict[str, Any]] = []

    for dimension in categorical_columns[:6]:
        if df[dimension].dropna().nunique() < 2:
            continue
        for metric in unique_metrics:
            values = pd.to_numeric(df[metric], errors="coerce")
            segment_df = pd.DataFrame({dimension: df[dimension].fillna("Sem categoria"), metric: values}).dropna()
            if segment_df.empty:
                continue
            grouped = segment_df.groupby(dimension)[metric].sum().sort_values(ascending=False)
            total = float(grouped.sum())
            if total == 0:
                continue
            leader = str(grouped.index[0])
            leader_value = float(grouped.iloc[0])
            segments.append(
                {
                    "dimension": dimension,
                    "metric": metric,
                    "leader": leader,
                    "value": round(leader_value, 2),
                    "share": round(leader_value / total, 4),
                    "runner_up": str(grouped.index[1]) if len(grouped) > 1 else None,
                    "runner_up_value": round(float(grouped.iloc[1]), 2) if len(grouped) > 1 else None,
                }
            )

    return sorted(segments, key=lambda item: item["share"], reverse=True)


def _priority_metrics(numeric_columns: list[str]) -> list[str]:
    ordered: list[str] = []
    for keywords in BUSINESS_METRIC_KEYWORDS.values():
        for column in numeric_columns:
            if any(keyword in column.lower() for keyword in keywords) and column not in ordered:
                ordered.append(column)
    for column in numeric_columns:
        if column not in ordered:
            ordered.append(column)
    return ordered


def _trend_analysis(df: pd.DataFrame, date_columns: list[str], primary_metric: str | None) -> dict[str, Any] | None:
    if not date_columns or not primary_metric:
        return None
    date_col = date_columns[0]
    trend_df = df[[date_col, primary_metric]].copy()
    trend_df[date_col] = pd.to_datetime(trend_df[date_col], errors="coerce")
    trend_df[primary_metric] = pd.to_numeric(trend_df[primary_metric], errors="coerce")
    trend_df = trend_df.dropna()
    if trend_df.empty:
        return None

    monthly = trend_df.groupby(trend_df[date_col].dt.to_period("M"))[primary_metric].sum()
    if len(monthly) < 2:
        return None

    previous = float(monthly.iloc[-2])
    current = float(monthly.iloc[-1])
    change = (current - previous) / previous if previous else 0
    direction = "cresceu" if change >= 0 else "caiu"
    return {
        "title": f"Comparacao mensal de {primary_metric}",
        "severity": "positiva" if change >= 0 else "atencao",
        "detail": (
            f"No ultimo mes, {primary_metric} {direction} {_pct(abs(change))} em relacao ao mes anterior "
            f"({_money_or_number(previous)} para {_money_or_number(current)})."
        ),
        "metric": primary_metric,
        "period": str(monthly.index[-1]),
        "previous_period": str(monthly.index[-2]),
        "current_value": round(current, 2),
        "previous_value": round(previous, 2),
        "change_pct": round(change, 4),
    }


def _detect_anomalies(
    df: pd.DataFrame, numeric_columns: list[str], profiles: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    anomalies: list[dict[str, Any]] = []
    for column in numeric_columns[:8]:
        values = pd.to_numeric(df[column], errors="coerce")
        mean = values.mean()
        std = values.std()
        if pd.isna(std) or std == 0:
            continue
        z_scores = ((values - mean) / std).abs().sort_values(ascending=False)
        for index, score in z_scores.head(2).items():
            if score >= 2.5:
                anomalies.append(
                    {
                        "column": column,
                        "row": int(index) + 2,
                        "value": _round_or_none(values.loc[index]),
                        "score": round(float(score), 2),
                        "detail": f"Valor {_money_or_number(values.loc[index])} em {column} esta fora do padrao.",
                    }
                )

    for profile in profiles:
        if profile.get("missing_ratio", 0) >= 0.15:
            anomalies.append(
                {
                    "column": profile["name"],
                    "row": None,
                    "value": profile.get("missing_count"),
                    "score": round(profile["missing_ratio"] * 10, 2),
                    "detail": f"{profile['name']} possui {_pct(profile['missing_ratio'])} de celulas vazias.",
                }
            )
    return anomalies


def _data_quality_risks(profiles: list[dict[str, Any]], row_count: int) -> list[dict[str, Any]]:
    risks = []
    for profile in profiles:
        if profile.get("missing_ratio", 0) >= 0.2:
            risks.append(
                {
                    "title": f"Dados incompletos em {profile['name']}",
                    "severity": "media",
                    "detail": (
                        f"{profile['name']} tem {profile['missing_count']} vazios em {row_count} registros. "
                        "Isso pode distorcer filtros e comparacoes."
                    ),
                }
            )
    return risks


def _segment_finding(segment: dict[str, Any]) -> dict[str, Any]:
    return {
        "title": f"{segment['leader']} lidera {segment['dimension']}",
        "severity": "alta" if segment["share"] >= 0.45 else "media",
        "detail": (
            f"Em {segment['dimension']}, {segment['leader']} concentra {_pct(segment['share'])} "
            f"de {segment['metric']} ({_money_or_number(segment['value'])})."
        ),
        "evidence": segment,
    }


def _add_trend_recommendation(
    trend: dict[str, Any],
    risks: list[dict[str, Any]],
    opportunities: list[dict[str, Any]],
    recommendations: list[dict[str, Any]],
) -> None:
    if trend["change_pct"] < -0.08:
        risks.append(
            {
                "title": "Queda mensal relevante",
                "severity": "alta",
                "detail": trend["detail"],
                "evidence": trend,
            }
        )
        recommendations.append(
            {
                "title": "Investigar queda recente",
                "priority": "alta",
                "detail": "Comparar canais, regioes e produtos do ultimo mes contra o mes anterior.",
            }
        )
    elif trend["change_pct"] > 0.08:
        opportunities.append(
            {
                "title": "Crescimento recente",
                "impact": "alto",
                "detail": trend["detail"],
            }
        )


def _action_plan(
    findings: list[dict[str, Any]],
    risks: list[dict[str, Any]],
    opportunities: list[dict[str, Any]],
    recommendations: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    plan: list[dict[str, Any]] = []
    for index, risk in enumerate(risks[:2], start=1):
        plan.append(
            {
                "step": index,
                "owner": "Gestor responsavel",
                "action": f"validar causa raiz de {risk['title'].lower()}",
                "expected_result": "Reduzir risco e criar indicador de acompanhamento.",
                "priority": risk.get("severity", "media"),
            }
        )
    for opportunity in opportunities[:2]:
        plan.append(
            {
                "step": len(plan) + 1,
                "owner": "Time comercial/operacoes",
                "action": f"testar iniciativa para {opportunity['title'].lower()}",
                "expected_result": "Capturar ganho incremental com baixo atrito.",
                "priority": opportunity.get("impact", "medio"),
            }
        )
    for recommendation in recommendations[:2]:
        plan.append(
            {
                "step": len(plan) + 1,
                "owner": "Diretoria",
                "action": recommendation["detail"],
                "expected_result": "Transformar analise em decisao executiva.",
                "priority": recommendation.get("priority", "media"),
            }
        )
    if not plan and findings:
        plan.append(
            {
                "step": 1,
                "owner": "Analista",
                "action": "monitorar os principais achados semanalmente",
                "expected_result": "Criar rotina de gestao por indicadores.",
                "priority": "media",
            }
        )
    return plan[:5]


def _conclusion(
    primary_metric: str | None,
    findings: list[dict[str, Any]],
    risks: list[dict[str, Any]],
    opportunities: list[dict[str, Any]],
) -> str:
    metric_text = f" em torno de {primary_metric}" if primary_metric else ""
    if risks and opportunities:
        return (
            f"A operacao mostra sinais relevantes{metric_text}, com oportunidades claras, mas exige controle "
            "sobre concentracao e pontos fora do padrao antes de escalar decisoes."
        )
    if risks:
        return (
            f"A prioridade e reduzir riscos{metric_text}, validando concentracoes, qualidade dos dados e "
            "anomalias antes de novas iniciativas."
        )
    if opportunities:
        return (
            f"O cenario e favoravel para crescimento{metric_text}. A recomendacao e acelerar os segmentos "
            "com melhor desempenho e manter acompanhamento mensal."
        )
    return "A base esta organizada para acompanhamento executivo e deve ser usada como rotina de decisao."


def _director_brief(
    executive_summary: str,
    findings: list[dict[str, Any]],
    risks: list[dict[str, Any]],
    recommendations: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "meeting_title": "Preparar reuniao executiva",
        "opening": executive_summary,
        "talking_points": [finding["detail"] for finding in findings[:3]],
        "watchouts": [risk["detail"] for risk in risks[:3]],
        "decisions_needed": [recommendation["detail"] for recommendation in recommendations[:3]],
    }


def _chart_rationale(charts: list[dict[str, Any]]) -> list[dict[str, str]]:
    rationale = []
    for chart in charts:
        chart_type = chart.get("type", "grafico")
        rationale.append(
            {
                "chart": chart.get("title", "Grafico"),
                "reason": f"Escolhido automaticamente para destacar {chart_type} relevante na leitura executiva.",
            }
        )
    return rationale


def _confidence_score(df: pd.DataFrame, profiles: list[dict[str, Any]], charts: list[dict[str, Any]]) -> int:
    base = 65
    if len(df) >= 50:
        base += 12
    if len(charts) >= 3:
        base += 10
    base += min(10, len(profiles))
    missing_penalty = sum(profile.get("missing_ratio", 0) for profile in profiles) / max(len(profiles), 1) * 25
    return max(40, min(98, round(base - missing_penalty)))


def _quality_score_from_profiles(profiles: list[dict[str, Any]]) -> int:
    if not profiles:
        return 0
    missing_ratio = sum(profile.get("missing_ratio", 0) for profile in profiles) / len(profiles)
    return max(0, min(100, round(100 - missing_ratio * 80)))


def _find_kpi(kpis: list[dict[str, Any]], keywords: tuple[str, ...]) -> dict[str, Any] | None:
    for kpi in kpis:
        label = kpi.get("label", "").lower()
        if any(keyword in label for keyword in keywords):
            return kpi
    return None


def _answer_dimension(
    segments: list[dict[str, Any]],
    keywords: tuple[str, ...],
    label: str,
    metric_keywords: tuple[str, ...] = (),
) -> dict[str, Any]:
    candidates = [
        segment
        for segment in segments
        if any(keyword in segment.get("dimension", "").lower() for keyword in keywords)
    ]
    if metric_keywords:
        metric_candidates = [
            segment
            for segment in candidates
            if any(keyword in segment.get("metric", "").lower() for keyword in metric_keywords)
        ]
        if metric_candidates:
            candidates = metric_candidates

    if candidates:
        segment = candidates[0]
        return _chat_response(
            (
                f"O principal {label} e {segment['leader']}, com {_money_or_number(segment['value'])} "
                f"em {segment['metric']} e participacao de {_pct(segment['share'])}."
            ),
            "alta",
            evidence=[segment],
        )
    return _chat_response(f"Nao encontrei uma dimensao clara de {label} neste relatorio.", "baixa")


def _chat_response(
    answer: str,
    confidence: str,
    evidence: list[dict[str, Any]] | None = None,
    next_steps: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "answer": answer,
        "confidence": confidence,
        "evidence": evidence or [],
        "next_steps": next_steps or [],
    }


def _money_or_number(value: Any) -> str:
    rounded = _round_or_none(value)
    if rounded is None:
        return "-"
    prefix = "R$ " if abs(rounded) >= 1000 else ""
    if abs(rounded) >= 1_000_000:
        return f"{prefix}{rounded / 1_000_000:.2f}M"
    if abs(rounded) >= 1_000:
        return f"{prefix}{rounded / 1_000:.2f}k"
    if float(rounded).is_integer():
        return f"{prefix}{int(rounded)}"
    return f"{prefix}{rounded:.2f}"


def _pct(value: Any) -> str:
    rounded = _round_or_none(value)
    if rounded is None:
        return "-"
    return f"{rounded * 100:.1f}%"


def _round_or_none(value: Any) -> float | None:
    if value is None or pd.isna(value):
        return None
    return round(float(value), 4)
