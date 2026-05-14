import os


if os.environ.get("RUN_BROWSER_TESTS", "").lower() not in {"1", "true", "yes"}:
    collect_ignore_glob = ["test_app.py"]
else:
    collect_ignore_glob = []
