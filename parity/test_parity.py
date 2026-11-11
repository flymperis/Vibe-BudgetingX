"""pytest entry for the parity harness (CI-style).

    backend\\.venv\\Scripts\\python -B -m pytest -q parity\\test_parity.py              # modes a + b1 (+ d if VBX_PARITY_REAL_DB)
    set VBX_PARITY_FULL=1 & backend\\.venv\\Scripts\\python -B -m pytest -q parity\\test_parity.py   # + b2 (rich) and c

Fails when the run finds any difference that is not allow-listed in
allowlist.py. The full list is in parity/out/report.md.
"""

from __future__ import annotations

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True

import pytest  # noqa: E402

import run  # noqa: E402
from servers import py_ok  # noqa: E402


@pytest.mark.skipif(bool(py_ok()), reason=f"missing interpreter(s): {py_ok()} (create parity/.venv-old, see docs/PARITY_REPORT.md)")
def test_old_and_new_app_behave_the_same():
    args = [] if os.environ.get("VBX_PARITY_FULL") else ["--quick"]
    rc = run.main(args)
    with open(os.path.join(run.OUT, "report.md"), encoding="utf-8") as fh:
        report = fh.read()
    assert rc == 0, "undocumented parity differences, see parity/out/report.md:\n" + report[:6000]
