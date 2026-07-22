from __future__ import annotations

from io import BytesIO
from typing import Any
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.models.report import Report
from app.models.user import User


def generate_report_pdf(report: Report, owner: User) -> BytesIO:
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=1.4 * cm,
        leftMargin=1.4 * cm,
        topMargin=1.3 * cm,
        bottomMargin=1.3 * cm,
        title=f"SmartReports - {report.title}",
    )

    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="SmartTitle",
            parent=styles["Title"],
            fontSize=22,
            leading=28,
            textColor=colors.HexColor("#17202A"),
            spaceAfter=10,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Section",
            parent=styles["Heading2"],
            fontSize=12,
            leading=16,
            textColor=colors.HexColor("#1F6F78"),
            spaceBefore=14,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="BodySmart",
            parent=styles["BodyText"],
            fontSize=9.5,
            leading=14,
            textColor=colors.HexColor("#2D3748"),
        )
    )

    story: list[Any] = [
        _cover(report, owner, styles),
        PageBreak(),
    ]

    analyst_report = (report.analysis_summary or {}).get("analyst_report") or {}
    story.append(_section("Resumo executivo", styles))
    story.append(Paragraph(_safe(analyst_report.get("executive_summary") or report.insight_text), styles["BodySmart"]))

    summary = report.analysis_summary or {}
    cards = analyst_report.get("kpis") or summary.get("summary_cards", [])
    if cards:
        story.append(_section("Indicadores principais", styles))
        story.append(_metrics_table(cards))

    for section_title, key in (
        ("Descobertas relevantes", "findings"),
        ("Riscos e alertas", "risks"),
        ("Oportunidades", "opportunities"),
        ("Recomendacoes", "recommendations"),
    ):
        items = analyst_report.get(key) or []
        if items:
            story.append(_section(section_title, styles))
            story.append(_bullet_table(items))

    action_plan = analyst_report.get("action_plan") or []
    if action_plan:
        story.append(_section("Plano de acao", styles))
        rows = [["Etapa", "Responsavel", "Acao", "Prioridade"]]
        for item in action_plan:
            rows.append(
                [
                    str(item.get("step", "-")),
                    item.get("owner", "-"),
                    item.get("action", "-"),
                    item.get("priority", "-"),
                ]
            )
        story.append(_styled_table(rows, [1.6 * cm, 4.0 * cm, 8.0 * cm, 3.0 * cm]))

    charts = summary.get("charts", [])
    if charts:
        story.append(_section("Graficos recomendados", styles))
        chart_rows = [["Grafico", "Tipo", "Leitura executiva"]]
        for chart in charts[:6]:
            chart_rows.append(
                [
                    chart.get("title", "-"),
                    chart.get("type", "-"),
                    _chart_readout(chart),
                ]
            )
        story.append(_styled_table(chart_rows, [6.0 * cm, 2.4 * cm, 8.4 * cm]))

    columns = (report.columns_schema or {}).get("columns", [])
    if columns:
        story.append(_section("Perfil das colunas", styles))
        rows = [["Coluna", "Tipo", "Vazios", "Unicos"]]
        for column in columns[:18]:
            rows.append(
                [
                    column.get("name", "-"),
                    column.get("type", "-"),
                    str(column.get("missing_count", 0)),
                    str(column.get("unique_count", 0)),
                ]
            )
        story.append(_styled_table(rows, [6.8 * cm, 3.2 * cm, 2.2 * cm, 2.2 * cm]))

    conclusion = analyst_report.get("conclusion")
    if conclusion:
        story.append(_section("Conclusao", styles))
        story.append(Paragraph(_safe(conclusion), styles["BodySmart"]))

    doc.build(story)
    buffer.seek(0)
    return buffer


def _cover(report: Report, owner: User, styles: dict[str, Any]) -> Table:
    title = Paragraph("SmartReports", styles["SmartTitle"])
    subtitle = Paragraph(_safe(f"Relatorio executivo: {report.title}"), styles["BodySmart"])
    meta = Paragraph(
        _safe(
            f"Empresa: {owner.company_name or owner.full_name}<br/>"
            f"Arquivo: {report.filename}<br/>"
            f"Planilha: {report.source_sheet or 'principal'}"
        ),
        styles["BodySmart"],
    )
    table = Table([[title], [subtitle], [Spacer(1, 18)], [meta]], colWidths=[17.0 * cm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F5F7F6")),
                ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#17202A")),
                ("LEFTPADDING", (0, 0), (-1, -1), 28),
                ("RIGHTPADDING", (0, 0), (-1, -1), 28),
                ("TOPPADDING", (0, 0), (-1, 0), 60),
                ("BOTTOMPADDING", (0, -1), (-1, -1), 60),
            ]
        )
    )
    return table


def _section(title: str, styles: dict[str, Any]) -> Paragraph:
    return Paragraph(title, styles["Section"])


def _metrics_table(cards: list[dict[str, Any]]) -> Table:
    rows = [["Indicador", "Valor", "Detalhe"]]
    for card in cards[:8]:
        rows.append([_safe(card.get("label", "-")), _safe(str(card.get("value", "-"))), _safe(card.get("detail", ""))])
    return _styled_table(rows, [7.0 * cm, 4.0 * cm, 6.0 * cm])


def _bullet_table(items: list[dict[str, Any]]) -> Table:
    rows = [["Tema", "Leitura executiva"]]
    for item in items[:6]:
        rows.append([_safe(item.get("title", "-")), _safe(item.get("detail", "-"))])
    return _styled_table(rows, [5.0 * cm, 12.0 * cm])


def _styled_table(rows: list[list[Any]], widths: list[float]) -> Table:
    styles = getSampleStyleSheet()
    body_style = ParagraphStyle(
        name="TableBodySmart",
        parent=styles["BodyText"],
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#2D3748"),
    )
    header_style = ParagraphStyle(
        name="TableHeaderSmart",
        parent=styles["BodyText"],
        fontSize=8.5,
        leading=11,
        textColor=colors.white,
        fontName="Helvetica-Bold",
    )
    normalized_rows = [
        [
            cell
            if hasattr(cell, "wrap")
            else Paragraph(_safe(str(cell)), header_style if row_index == 0 else body_style)
            for cell in row
        ]
        for row_index, row in enumerate(rows)
    ]
    table = Table(normalized_rows, colWidths=widths, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1F6F78")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                ("LEADING", (0, 0), (-1, -1), 11),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F6F8FA")]),
                ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#D8DEE4")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return table


def _chart_readout(chart: dict[str, Any]) -> str:
    title = chart.get("title", "Grafico")
    if chart.get("type") == "pie":
        labels = chart.get("labels") or []
        values = chart.get("values") or []
        if labels and values:
            return f"Maior fatia: {labels[0]} ({values[0]} registros)."
    if chart.get("y"):
        values = [value for value in chart.get("y", []) if isinstance(value, (int, float))]
        if values:
            return f"Valores entre {min(values):,.2f} e {max(values):,.2f}."
    return f"{title} pronto para exploracao no dashboard interativo."


def _safe(value: Any) -> str:
    return escape(str(value or "-"))
