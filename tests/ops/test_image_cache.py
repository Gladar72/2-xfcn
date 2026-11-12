import importlib.util
import os
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("prune_cache", Path(__file__).parents[2] / "deploy/yandex/prune-image-cache.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ImageCacheTests(unittest.TestCase):
    def test_removes_only_old_expired_derivatives(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            folder = root / ("a" * 43 + "=")
            folder.mkdir()
            now = 1800000000
            expired = folder / f"86400.{int((now - 1) * 1000)}.etag.webp"
            recent = folder / f"86400.{int((now - 2) * 1000)}.etag.webp"
            valid = folder / f"86400.{int((now + 1) * 1000)}.etag.webp"
            original = folder / "photo.jpg"
            for path in [expired, recent, valid, original]:
                path.write_bytes(b"image")
                os.utime(path, (now - 10 * 86400, now - 10 * 86400))
            os.utime(recent, (now, now))
            self.assertEqual(module.prune(root, now), (1, 5))
            self.assertFalse(expired.exists())
            self.assertTrue(all(p.exists() for p in [recent, valid, original]))

    def test_does_not_follow_directory_or_file_symlinks(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "cache"
            root.mkdir()
            target = Path(temporary) / "original"
            target.write_bytes(b"keep")
            (root / ("b" * 44)).symlink_to(target.parent, target_is_directory=True)
            folder = root / ("c" * 44)
            folder.mkdir()
            (folder / "86400.1700000000000.etag.webp").symlink_to(target)
            self.assertEqual(module.prune(root, 1800000000), (0, 0))
            self.assertEqual(target.read_bytes(), b"keep")


if __name__ == "__main__":
    unittest.main()
