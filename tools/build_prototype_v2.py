"""Build the current 168 prototype from the unified flow model."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).with_name('build_flow.py')), run_name='__main__')
