"""Library imports must not reconfigure detached service output streams."""
import runpy
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

class ImportSafetyTests(unittest.TestCase):
    def test_html_module_import_does_not_touch_service_stdout(self):
        stream = Mock()
        stream.reconfigure.side_effect = PermissionError(13, 'Permission denied')
        with patch('sys.stdout', stream):
            runpy.run_path(str(Path(__file__).with_name('create_storybook_html.py')), run_name='import_probe')
        stream.reconfigure.assert_not_called()

if __name__ == '__main__':
    unittest.main()
