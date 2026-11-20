"""Найти файлы по задаче в дереве Git. Для запуска нужен Python 3."""

import argparse
import os
import subprocess


SECTIONS = {
    "web": ["app", "components", "middleware.ts"],
    "mobile": ["mobile"],
    "server": ["app/api", "lib", "supabase", "tests"],
    "bot": ["app/api/telegram", "lib/telegram", "n8n", "scripts/set-telegram-webhook.ts"],
    "media": ["assets", "mobile/assets", "public/brand", "public/marketing", "public/mesto", "public/promo", "public/site"],
    "ops": [".github", "deploy"],
}
PAGE_SIZE = 16


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("section", choices=SECTIONS)
    parser.add_argument("--ref", default="HEAD", help="Ветка, тег или коммит в локальной копии")
    parser.add_argument("--match", default="", help="Подстрока в пути к файлу")
    parser.add_argument("--page", type=int, default=1, help="Страница, начиная с 1")
    args = parser.parse_args()
    if args.page < 1 or args.ref.startswith("-"):
        parser.error("Укажите положительный номер страницы и корректную ссылку Git.")

    # Git читает только деревья. Это работает и в клоне без содержимого медиафайлов.
    result = subprocess.run(
        ["git", "ls-tree", "-rz", "--full-tree", args.ref, "--", *SECTIONS[args.section]],
        stdout=subprocess.PIPE,
    )
    if result.returncode:
        raise SystemExit(result.returncode)

    first = (args.page - 1) * PAGE_SIZE
    needle = args.match.casefold()
    count = 0
    for entry in result.stdout.split(b"\0"):
        if not entry:
            continue
        metadata, raw_path = entry.split(b"\t", 1)
        path = os.fsdecode(raw_path)
        if args.section == "web" and path.startswith("app/api/"):
            continue
        if needle not in path.casefold():
            continue
        if first <= count < first + PAGE_SIZE:
            short_sha = metadata.split()[-1][:12].decode("ascii")
            label = repr(path)[1:-1]
            if len(label) > 144:
                label = label[:70] + " … " + label[-70:]
            print(f"{short_sha}  {label}")
        count += 1

    pages = max(1, (count + PAGE_SIZE - 1) // PAGE_SIZE)
    if args.page > pages:
        parser.error(f"По этому запросу доступно страниц: {pages}.")
    print(f"Найдено: {count}. Страница {args.page}/{pages}.")


if __name__ == "__main__":
    main()
