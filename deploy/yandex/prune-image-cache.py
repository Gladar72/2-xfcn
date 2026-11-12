"""Remove only expired, old Next image derivatives. Never follow symlinks."""
import re
import stat
import sys
import time
from pathlib import Path

HASH = re.compile(r"[A-Za-z0-9_+=-]{32,128}\Z")
IMAGE = re.compile(r"\d+\.(\d{13})\.[A-Za-z0-9_+=-]+\.(?:webp|avif|png|jpeg|jpg|gif|ico|svg)\Z")
GRACE = 7 * 86400


def prune(root: Path, now=None):
    now = time.time() if now is None else now
    removed = freed = 0
    if root.is_symlink() or not root.is_dir():
        return removed, freed
    for directory in root.iterdir():
        if directory.is_symlink() or not directory.is_dir() or not HASH.fullmatch(directory.name):
            continue
        try:
            images = list(directory.iterdir())
        except FileNotFoundError:
            continue
        for image in images:
            match = IMAGE.fullmatch(image.name)
            if not match or int(match[1]) / 1000 >= now:
                continue
            try:
                info = image.lstat()
                if not stat.S_ISREG(info.st_mode) or info.st_mtime >= now - GRACE:
                    continue
                image.unlink()
                removed += 1
                freed += info.st_size
            except FileNotFoundError:
                pass  # The optimizer replaced this derivative concurrently.
        try:
            directory.rmdir()  # Only empty directories; never recursive deletion.
        except OSError:
            pass
    return removed, freed


if __name__ == "__main__":
    path = Path(sys.argv[1])
    # CLI is restricted to the known Docker volume, not an arbitrary host path.
    if path != Path("/var/lib/docker/volumes/mesto_image_cache/_data"):
        raise SystemExit("Unexpected image cache path")
    removed, freed = prune(path)
    print(f"image cache: removed={removed}; freed_bytes={freed}; fresh derivatives retained")
