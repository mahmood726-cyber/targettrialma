from pathlib import Path


APP_HTML = Path(__file__).with_name("index.html")


def test_app_shell_contains_required_controls():
    html = APP_HTML.read_text(encoding="utf-8")
    required_markers = [
        "<title>Target Trial Emulation Meta-Analysis</title>",
        'id="csv-input"',
        'id="effect-select"',
        'id="btn-demo"',
        'id="btn-analyze"',
        "function runAnalysis",
        "function exportCSV",
    ]
    missing = [marker for marker in required_markers if marker not in html]
    assert missing == []
