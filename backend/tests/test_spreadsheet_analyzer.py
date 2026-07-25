from io import BytesIO
from pathlib import Path
import sys

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.spreadsheet_analyzer import analyze_spreadsheet
from app.services.analyst import answer_report_question
from app.services.ai_chat import answer_report_question_with_ai
from app.core.config import get_settings


class DummyReport:
    def __init__(self, analysis):
        self.analysis_summary = analysis["summary"]
        self.insight_text = analysis["insights"]


def test_analyze_spreadsheet_detects_schema_metrics_and_charts():
    df = pd.DataFrame(
        {
            "Data": pd.date_range("2026-01-01", periods=6, freq="D"),
            "Produto": ["A", "A", "B", "B", "C", "C"],
            "Receita": [1200, 1350, 900, 1100, 2100, 2400],
            "Margem": [320, 360, 180, 260, 760, 830],
        }
    )
    buffer = BytesIO()
    df.to_excel(buffer, index=False)

    analysis = analyze_spreadsheet(buffer.getvalue(), "vendas.xlsx")

    assert analysis["schema"]["row_count"] == 6
    assert analysis["schema"]["column_count"] == 4
    assert analysis["schema"]["types"]["numeric"] == 2
    assert analysis["summary"]["summary_cards"]
    assert analysis["summary"]["charts"]
    assert "qualidade" in analysis["insights"]
    assert analysis["summary"]["analyst_report"]["executive_summary"]
    assert analysis["summary"]["analyst_report"]["action_plan"]


def test_smart_analyst_answers_contextual_questions():
    df = pd.DataFrame(
        {
            "Data": pd.date_range("2026-01-01", periods=10, freq="D"),
            "Regiao": ["Sudeste"] * 7 + ["Sul"] * 3,
            "Vendedor": ["Ana"] * 6 + ["Bruno"] * 4,
            "Receita": [1000, 1200, 1300, 1250, 1400, 1500, 1600, 700, 750, 800],
            "Lucro": [420, 500, 530, 510, 560, 600, 650, 210, 230, 250],
        }
    )
    buffer = BytesIO()
    df.to_excel(buffer, index=False)
    analysis = analyze_spreadsheet(buffer.getvalue(), "vendas.xlsx")

    response = answer_report_question("Qual regiao gera mais lucro?", DummyReport(analysis))

    assert "Sudeste" in response["answer"]
    assert response["confidence"] in {"media", "alta"}


def test_ai_chat_falls_back_to_local_analyst_without_openai_key(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "")
    get_settings.cache_clear()

    try:
        df = pd.DataFrame(
            {
                "Data": pd.date_range("2026-01-01", periods=10, freq="D"),
                "Regiao": ["Sudeste"] * 7 + ["Sul"] * 3,
                "Receita": [1000, 1200, 1300, 1250, 1400, 1500, 1600, 700, 750, 800],
                "Lucro": [420, 500, 530, 510, 560, 600, 650, 210, 230, 250],
            }
        )
        buffer = BytesIO()
        df.to_excel(buffer, index=False)
        analysis = analyze_spreadsheet(buffer.getvalue(), "vendas.xlsx")

        response = answer_report_question_with_ai("Qual regiao gera mais lucro?", DummyReport(analysis))

        assert "Sudeste" in response["answer"]
        assert response["evidence"][0]["value"] == "Smart Analyst local"
    finally:
        get_settings.cache_clear()
