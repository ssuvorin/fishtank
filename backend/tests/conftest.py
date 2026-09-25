import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("LAW_JSON_PATH", str(ROOT.parent / "law.json"))
os.environ.setdefault("OPENROUTER_API_KEY", "test-key")
