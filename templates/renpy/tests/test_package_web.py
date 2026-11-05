"""Filesystem failure tests; synthetic files are not an engine fixture."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

spec = importlib.util.spec_from_file_location("package_test", Path(__file__).parents[1] / "scripts/package-web.py")
packager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packager)


class PackageTests(unittest.TestCase):
    def fixture(self, root):
        source = root / "export"
        source.mkdir()
        (root / "game").mkdir()
        (root / "opengame-sdk").mkdir()
        for name in ("opengame.py", "opengame.rpy", "opengame_session.py"):
            (root / "game" / name).write_text("fixture " + name)
        for name in ("opengame.py", "opengame.rpy"):
            (root / "opengame-sdk" / name).write_bytes((root / "game" / name).read_bytes())
        for name in ("lifecycle.js", "opengame.js", "LICENSE"):
            (root / "opengame-sdk" / name).write_text(name)
        (root / "opengame.json").write_text("{}")
        (root / "sdk").mkdir()
        (root / "sdk/opengame-global.js").write_text("fixture global sdk")
        (root / "sdk/opengame-global.js.LEGAL.txt").write_text("fixture notice")
        for name in ("renpy.js", "renpy-pre.js"):
            (source / name).write_text("fixture")
        (source / "index.html").write_text('<html><script src="renpy.js"></script></html>')
        (source / "fixture.wasm").write_bytes(bytes(12))
        with zipfile.ZipFile(source / "game.zip", "w") as archive:
            for name in ("opengame.py", "opengame_session.py"):
                archive.write(root / "game" / name, "game/" + name)
            for stem in ("opengame", "script", "screens", "options"):
                archive.writestr("game/" + stem + ".rpy", "fixture")
        return source

    def test_failed_staging_preserves_previous_and_retry_works(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = self.fixture(root)
            with patch.object(packager, "ROOT", root):
                packager.package_web(source)
                before = (root / "dist/index.html").read_bytes()
                with patch.object(packager.shutil, "copy2", side_effect=OSError("copy failed")):
                    with self.assertRaises(OSError):
                        packager.package_web(source)
                self.assertEqual((root / "dist/index.html").read_bytes(), before)
                packager.package_web(source)
                self.assertTrue((root / "dist/.opengame-renpy-export").is_file())

    def test_interrupted_swap_recovers_backup(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = self.fixture(root)
            with patch.object(packager, "ROOT", root):
                packager.package_web(source)
                (root / "dist").rename(root / ".build/opengame-renpy-previous")
                packager.package_web(source)
                self.assertTrue((root / "dist/.opengame-renpy-export").is_file())

    def test_partially_deleted_backup_has_external_ownership_record(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = self.fixture(root)
            with patch.object(packager, "ROOT", root):
                packager.package_web(source)
                backup = root / ".build/opengame-renpy-previous"
                backup.mkdir()
                (backup / "leftover").write_text("partial cleanup")
                (root / ".build/opengame-renpy-previous.owned").write_text("opengame-renpy-backup-v1\n")
                packager.package_web(source)
                self.assertFalse(backup.exists())
                self.assertTrue((root / "dist/.opengame-renpy-export").is_file())

    def test_page_loads_the_shipped_sdk_not_the_edge_path(self):
        # /_og/sdk.js exists only on a contract that adds the SDK at the edge, so an
        # ordinary release that named it had no OpenGame (area F, 1 Nov 2026).
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = self.fixture(root)
            with patch.object(packager, "ROOT", root):
                packager.package_web(source)
            html = (root / "dist/index.html").read_text()
            self.assertNotIn("/_og/sdk.js", html)
            self.assertLess(html.index('<script src="opengame-global.js">'), html.index('opengame-sdk/lifecycle.js'))
            self.assertLess(html.index('opengame-sdk/opengame.js'), html.index('src="renpy.js"'))
            self.assertEqual((root / "dist/opengame-global.js").read_bytes(), (root / "sdk/opengame-global.js").read_bytes())
            self.assertTrue((root / "dist/opengame-global.js.LEGAL.txt").is_file())

    def test_missing_sdk_stops_before_anything_is_written(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "starters" / "renpy"
            root.mkdir(parents=True)
            source = self.fixture(root)
            (root / "sdk/opengame-global.js.LEGAL.txt").unlink()
            with patch.object(packager, "ROOT", root):
                with self.assertRaisesRegex(ValueError, "--sdk"):
                    packager.package_web(source)
            self.assertFalse((root / "dist").exists())

    def test_sdk_flag_names_the_archive_copy(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = self.fixture(root)
            archive = root / "archive/sdk"
            archive.mkdir(parents=True)
            (archive / "opengame-global.js").write_text("archive sdk")
            (archive / "opengame-global.js.LEGAL.txt").write_text("archive notice")
            with patch.object(packager, "ROOT", root):
                packager.package_web(source, str(archive / "opengame-global.js"))
            self.assertEqual((root / "dist/opengame-global.js").read_text(), "archive sdk")


if __name__ == "__main__":
    unittest.main()
