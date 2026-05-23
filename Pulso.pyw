from __future__ import annotations

import runpy
import sys
import os
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SCRIPTS = ROOT / "scripts"

if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

os.environ["PULSO_LAUNCHER_MODE"] = "client"
runpy.run_path(str(SCRIPTS / "tenant_launcher_web.pyw"), run_name="__main__")
