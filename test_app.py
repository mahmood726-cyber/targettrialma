"""
Target Trial Emulation Meta-Analysis — Selenium test suite.
Run: cd C:\\Models\\TargetTrialMA && python -m pytest test_app.py -v
"""
import os
import sys
import time
import math
import signal
import threading
import http.server
import pytest

# UTF-8 handled via PYTHONUTF8 env var or pytest flags

# Monkey-patch for Python 3.13 WMI deadlock
import platform
if hasattr(platform, "_wmi_query"):
    platform._wmi_query = lambda *a, **k: None

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC

# ---- Fixtures ----

PORT = 18234
HTML_DIR = os.path.dirname(os.path.abspath(__file__))

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

@pytest.fixture(scope="session")
def server():
    handler = lambda *a, **k: QuietHandler(*a, directory=HTML_DIR, **k)
    srv = http.server.HTTPServer(("127.0.0.1", PORT), handler)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    yield f"http://127.0.0.1:{PORT}/index.html"
    srv.shutdown()


@pytest.fixture(scope="session")
def driver(server):
    """Launch headless Chrome."""
    # Kill orphan chrome/chromedriver
    if sys.platform == "win32":
        os.system("taskkill /f /im chromedriver.exe >NUL 2>&1")

    opts = webdriver.ChromeOptions()
    opts.add_argument("--headless=new")
    opts.add_argument("--disable-gpu")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--window-size=1400,900")
    opts.set_capability("goog:loggingPrefs", {"browser": "ALL"})

    # Use cached chromedriver to avoid Selenium Manager timeout
    from selenium.webdriver.chrome.service import Service as ChromeService
    chromedriver_path = os.path.expanduser(
        "~/.cache/selenium/chromedriver/win64/146.0.7680.165/chromedriver.exe"
    )
    try:
        if os.path.isfile(chromedriver_path):
            svc = ChromeService(executable_path=chromedriver_path)
            drv = webdriver.Chrome(service=svc, options=opts)
        else:
            drv = webdriver.Chrome(options=opts)
    except Exception:
        # Try Edge as fallback
        edge_opts = webdriver.EdgeOptions()
        edge_opts.add_argument("--headless=new")
        edge_opts.add_argument("--disable-gpu")
        edge_opts.add_argument("--no-sandbox")
        edge_opts.add_argument("--window-size=1400,900")
        drv = webdriver.Edge(options=edge_opts)

    drv.set_page_load_timeout(60)
    drv.implicitly_wait(5)
    yield drv
    drv.quit()


def load_and_analyze(driver, url, csv_text=None, effect="HR"):
    """Navigate, optionally load CSV, set effect, click Analyze."""
    driver.get(url)
    WebDriverWait(driver, 10).until(
        EC.presence_of_element_located((By.ID, "btn-analyze"))
    )
    if csv_text:
        ta = driver.find_element(By.ID, "csv-input")
        ta.clear()
        ta.send_keys(csv_text)
    else:
        driver.find_element(By.ID, "btn-demo").click()
    if effect != "HR":
        sel = Select(driver.find_element(By.ID, "effect-select"))
        sel.select_by_value(effect)
    driver.find_element(By.ID, "btn-analyze").click()
    time.sleep(0.5)


def get_summary_cells(driver):
    """Return summary table as list of dicts."""
    rows = driver.find_elements(By.CSS_SELECTOR, "#summary-table tbody tr")
    data = []
    for row in rows:
        cells = row.find_elements(By.TAG_NAME, "td")
        data.append([c.text for c in cells])
    return data


# ---- Tests ----

class TestAppLoading:
    def test_01_loads_without_js_errors(self, driver, server):
        """App loads without JS errors."""
        driver.get(server)
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.ID, "btn-analyze"))
        )
        logs = driver.get_log("browser")
        # Filter out network errors (like favicon 404) — only check JS errors
        severe = [l for l in logs if l["level"] == "SEVERE" and l.get("source") != "network"]
        assert len(severe) == 0, f"JS errors: {severe}"

    def test_02_demo_data_loads_10_studies(self, driver, server):
        """Demo data loads 10 studies (4 RCT + 6 TTE)."""
        load_and_analyze(driver, server)
        # Check stat cards
        cards = driver.find_elements(By.CSS_SELECTOR, ".stat-card .value")
        values = [c.text for c in cards]
        assert values[0] == "10", f"Expected 10 total studies, got {values[0]}"
        assert values[1] == "4", f"Expected 4 RCT, got {values[1]}"
        assert values[2] == "6", f"Expected 6 TTE, got {values[2]}"


class TestPooledEstimates:
    def test_03_rct_pooled_hr_range(self, driver, server):
        """RCT-only pooled HR in [0.70, 0.85]."""
        load_and_analyze(driver, server)
        rows = get_summary_cells(driver)
        rct_hr = float(rows[0][1])
        assert 0.70 <= rct_hr <= 0.85, f"RCT pooled HR={rct_hr} out of [0.70, 0.85]"

    def test_04_tte_pooled_hr_range(self, driver, server):
        """TTE-only pooled HR in [0.70, 0.85]."""
        load_and_analyze(driver, server)
        rows = get_summary_cells(driver)
        tte_hr = float(rows[1][1])
        assert 0.70 <= tte_hr <= 0.85, f"TTE pooled HR={tte_hr} out of [0.70, 0.85]"

    def test_05_combined_pooled_hr_range(self, driver, server):
        """Combined pooled HR in [0.70, 0.85]."""
        load_and_analyze(driver, server)
        rows = get_summary_cells(driver)
        combined_hr = float(rows[2][1])
        assert 0.70 <= combined_hr <= 0.85, f"Combined pooled HR={combined_hr} out of [0.70, 0.85]"

    def test_06_interaction_test_nonsig(self, driver, server):
        """Interaction test p > 0.05 for demo data (RCT and TTE similar)."""
        load_and_analyze(driver, server)
        result_el = driver.find_element(By.ID, "interaction-result")
        text = result_el.text
        assert "p =" in text or "p=" in text, f"No p-value found in: {text}"
        # Extract p-value
        import re
        m = re.search(r'p\s*=\s*([0-9.]+|<0\.001)', text)
        assert m, f"Could not parse p-value from: {text}"
        pval_str = m.group(1)
        if pval_str == "<0.001":
            pval = 0.0001
        else:
            pval = float(pval_str)
        assert pval > 0.05, f"Interaction p={pval} <= 0.05 (expected nonsig for demo)"


class TestROBINSI:
    def test_07_robins_weighting_changes_estimate(self, driver, server):
        """ROBINS-I adjusted estimate differs from unadjusted (Serious studies downweighted)."""
        # Use custom data where Serious study has a very different effect
        csv = """Study,Design,LogEffect,SE,ROBINS_I,C1,C2,C3,C4,C5,C6,C7,C8
Trial A,RCT,-0.20,0.08,Low,1,1,1,1,1,1,1,1
Trial B,RCT,-0.25,0.10,Low,1,1,1,1,1,1,1,1
Obs A,TTE,-0.10,0.09,Low,1,1,1,1,1,1,1,1
Obs B,TTE,-0.80,0.10,Serious,1,0,0,1,1,1,0,0
Obs C,TTE,-0.15,0.12,Moderate,1,1,0,1,1,1,1,0"""
        load_and_analyze(driver, server, csv_text=csv)
        rows = get_summary_cells(driver)
        combined_hr = float(rows[2][1])
        adjusted_hr = float(rows[3][1])
        # Obs B (-0.80, Serious) pulls combined down; when downweighted, adjusted should differ
        assert abs(combined_hr - adjusted_hr) > 0.005, \
            f"Adjusted ({adjusted_hr}) should differ from unadjusted ({combined_hr})"

    def test_08_critical_robins_excluded(self, driver, server):
        """Critical ROBINS-I study excluded from adjusted analysis."""
        csv = """Study,Design,LogEffect,SE,ROBINS_I,C1,C2,C3,C4,C5,C6,C7,C8
Study A,RCT,-0.20,0.08,Low,1,1,1,1,1,1,1,1
Study B,TTE,-0.25,0.10,Critical,1,0,0,0,0,0,0,0
Study C,TTE,-0.30,0.12,Low,1,1,1,1,1,1,1,1"""
        load_and_analyze(driver, server, csv_text=csv)
        # Check sensitivity panel mentions "excluded"
        sens = driver.find_element(By.ID, "sensitivity-container")
        assert "excluded" in sens.text.lower(), \
            f"Expected 'excluded' in sensitivity panel: {sens.text}"


class TestVisualizations:
    def test_09_heatmap_dimensions(self, driver, server):
        """Heatmap SVG has correct dimensions: 6 TTE rows x 8 columns."""
        load_and_analyze(driver, server)
        svg = driver.find_element(By.ID, "heatmap-svg")
        assert svg is not None, "Heatmap SVG not found"
        # Count Yes/No text elements as proxy for cells
        rects = svg.find_elements(By.TAG_NAME, "rect")
        # Should have background + 6*8 checklist cells + 6 ROBINS-I badges = 1 + 48 + 6 = 55
        # At minimum, should have > 48 rects
        assert len(rects) >= 48 + 6, f"Expected >= 54 rects, got {len(rects)}"

    def test_10_forest_plot_structure(self, driver, server):
        """Forest plot has 2 group headers + overall diamond."""
        load_and_analyze(driver, server)
        svg = driver.find_element(By.ID, "forest-svg")
        svg_html = svg.get_attribute("innerHTML")
        assert "RCT Studies" in svg_html, "Missing 'RCT Studies' header"
        assert "TTE Studies" in svg_html, "Missing 'TTE Studies' header"
        assert "Overall" in svg_html, "Missing 'Overall' diamond"
        # Count diamonds (polygons)
        polygons = svg.find_elements(By.TAG_NAME, "polygon")
        assert len(polygons) >= 3, f"Expected >= 3 diamonds, got {len(polygons)}"

    def test_11_hr_displayed_exp_scale(self, driver, server):
        """HR displayed on exponential scale (not log)."""
        load_and_analyze(driver, server)
        svg = driver.find_element(By.ID, "forest-svg")
        svg_text = svg.get_attribute("innerHTML")
        # DAPA-HF: logHR=-0.26, HR=exp(-0.26)=0.77
        # Should see "0.77" somewhere, NOT "-0.26" as displayed value
        assert "0.77" in svg_text, f"Expected HR 0.77 in forest plot"

    def test_12_sensitivity_two_diamonds(self, driver, server):
        """Sensitivity panel shows 2 diamonds (unadjusted vs adjusted)."""
        load_and_analyze(driver, server)
        svg = driver.find_element(By.ID, "sensitivity-svg")
        polygons = svg.find_elements(By.TAG_NAME, "polygon")
        assert len(polygons) == 2, f"Expected 2 diamonds, got {len(polygons)}"


class TestEdgeCases:
    def test_13_all_rct_input(self, driver, server):
        """All RCT input: TTE section shows 'No TTE studies'."""
        csv = """Study,Design,LogEffect,SE,ROBINS_I,C1,C2,C3,C4,C5,C6,C7,C8
Trial A,RCT,-0.20,0.08,Low,1,1,1,1,1,1,1,1
Trial B,RCT,-0.25,0.10,Low,1,1,1,1,1,1,1,1"""
        load_and_analyze(driver, server, csv_text=csv)
        forest = driver.find_element(By.ID, "forest-container")
        assert "No TTE studies" in forest.get_attribute("innerHTML"), \
            "Expected 'No TTE studies' message"

    def test_14_all_tte_input(self, driver, server):
        """All TTE input: RCT section shows 'No RCT studies'."""
        csv = """Study,Design,LogEffect,SE,ROBINS_I,C1,C2,C3,C4,C5,C6,C7,C8
Obs A,TTE,-0.20,0.09,Low,1,1,1,1,1,1,1,1
Obs B,TTE,-0.30,0.12,Moderate,1,1,0,1,1,1,1,0"""
        load_and_analyze(driver, server, csv_text=csv)
        forest = driver.find_element(By.ID, "forest-container")
        assert "No RCT studies" in forest.get_attribute("innerHTML"), \
            "Expected 'No RCT studies' message"

    def test_15_k1_per_group(self, driver, server):
        """k=1 per group still produces valid results."""
        csv = """Study,Design,LogEffect,SE,ROBINS_I,C1,C2,C3,C4,C5,C6,C7,C8
Single RCT,RCT,-0.20,0.08,Low,1,1,1,1,1,1,1,1
Single TTE,TTE,-0.25,0.10,Low,1,1,1,1,1,1,1,1"""
        load_and_analyze(driver, server, csv_text=csv)
        rows = get_summary_cells(driver)
        # Should have 5 rows (RCT, TTE, Combined, Adjusted, Interaction)
        assert len(rows) >= 4, f"Expected >= 4 summary rows, got {len(rows)}"
        rct_hr = float(rows[0][1])
        assert 0.5 < rct_hr < 1.5, f"k=1 RCT HR={rct_hr} out of range"


class TestTableAndExport:
    def test_16_summary_table_all_metrics(self, driver, server):
        """Summary table shows all key metrics."""
        load_and_analyze(driver, server)
        rows = get_summary_cells(driver)
        # Row 0: RCT, Row 1: TTE, Row 2: Combined, Row 3: Adjusted, Row 4: Interaction
        assert len(rows) >= 5, f"Expected >= 5 summary rows, got {len(rows)}"
        assert "RCT" in rows[0][0]
        assert "TTE" in rows[1][0]
        assert "Combined" in rows[2][0]
        assert "Adjusted" in rows[3][0]
        assert "Interaction" in rows[4][0]

    def test_17_export_csv_button_exists(self, driver, server):
        """Export CSV button exists and is clickable."""
        load_and_analyze(driver, server)
        btns = driver.find_elements(By.CSS_SELECTOR, ".btn-secondary")
        csv_btn = [b for b in btns if "CSV" in b.text and "Export" in b.text]
        assert len(csv_btn) >= 1, "Export CSV button not found"
        # Clicking should not throw (download initiated)
        csv_btn[0].click()
        time.sleep(0.3)


class TestEffectMeasure:
    def test_18_or_effect_label(self, driver, server):
        """Switching to OR updates labels."""
        load_and_analyze(driver, server, effect="OR")
        table = driver.find_element(By.ID, "summary-table")
        assert "OR" in table.get_attribute("innerHTML"), \
            "Expected 'OR' in summary table headers"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
