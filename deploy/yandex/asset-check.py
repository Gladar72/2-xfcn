#!/usr/bin/env python3
"""Read-only image audit. Output only counts/hosts, never photo URLs or user data."""
import collections
import concurrent.futures
import json
import subprocess
import urllib.error
import urllib.parse
import urllib.request

CANONICAL = "https://mesto-go.ru"
OLD_STORAGE = "cawrwvafbcmcxsjxgwxi.supabase.co"
HOSTS = {"mesto-go.ru", "www.mesto-go.ru", "new.mesto-go.ru", "2-xfcn.vercel.app", "db.mesto-go.ru", OLD_STORAGE}


def allowed(url):
    p = urllib.parse.urlsplit(url)
    return p.scheme == "https" and p.hostname in HOSTS and not p.username and not p.password and p.port in (None, 443)


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not allowed(newurl):
            raise urllib.error.HTTPError(req.full_url, 470, "redirect outside audit scope", headers, fp)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def probe(url):
    if not allowed(url):
        return "outside_scope"
    try:
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "MestoAssetCheck/1.0"})
        with urllib.request.build_opener(SafeRedirect()).open(req, timeout=8) as response:
            kind = response.headers.get_content_type()
            return "image_ok" if kind.startswith("image/") else "not_image:" + kind
    except urllib.error.HTTPError as exc:
        return "http_" + str(exc.code)
    except Exception as exc:
        return type(exc).__name__


def repaired_url(url):
    p = urllib.parse.urlsplit(url)
    if p.hostname in {"new.mesto-go.ru", "www.mesto-go.ru", "2-xfcn.vercel.app"}:
        return urllib.parse.urlunsplit(("https", "mesto-go.ru", p.path, p.query, ""))
    if p.hostname == OLD_STORAGE and p.path.startswith("/storage/v1/object/public/"):
        return urllib.parse.urlunsplit(("https", "db.mesto-go.ru", p.path, p.query, ""))
    return url


def check(url):
    original = probe(url)
    candidate = repaired_url(url)
    repaired = probe(candidate) if original != "image_ok" and candidate != url else None
    return url, original, repaired


def main():
    query = """
BEGIN READ ONLY; SET LOCAL statement_timeout='10s';
SELECT coalesce(json_agg(t), '[]') FROM (
  SELECT 'events' source, photo_url url FROM public.events WHERE photo_url IS NOT NULL
  UNION ALL SELECT 'city_events', photo_url FROM public.city_events WHERE photo_url IS NOT NULL
  UNION ALL SELECT 'avatars', avatar_url FROM public.users WHERE avatar_url IS NOT NULL
  UNION ALL SELECT 'profile_photos', url FROM public.user_photos WHERE url IS NOT NULL
  UNION ALL SELECT 'chat_photos', image_url FROM public.messages WHERE image_url IS NOT NULL
) t;
COMMIT;
"""
    result = subprocess.run(
        ["sudo", "docker", "exec", "-i", "supabase-db", "psql", "-U", "postgres", "-d", "postgres", "-qAt", "-v", "ON_ERROR_STOP=1"],
        input=query, text=True, capture_output=True, timeout=20,
    )
    if result.returncode:
        raise RuntimeError("read-only image query failed; raw database output withheld")
    rows = json.loads(result.stdout)
    sources = collections.defaultdict(collections.Counter)
    malformed = collections.Counter()
    for row in rows:
        raw = row["url"]
        if not isinstance(raw, str) or not raw.strip():
            malformed[row["source"]] += 1
            continue
        url = urllib.parse.urljoin(CANONICAL, raw)
        try:
            urllib.parse.urlsplit(url).port
        except ValueError:
            malformed[row["source"]] += 1
            continue
        sources[url][row["source"]] += 1
    counts = collections.Counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for url, original, repaired in pool.map(check, sources):
            host = urllib.parse.urlsplit(url).hostname
            # Unknown hosts are grouped to avoid publishing user-supplied domains.
            host = host if host in HOSTS else "external"
            for source, n in sources[url].items():
                counts[(source, host, original, repaired or "-")] += n
    print("References:", len(rows), "Unique URLs:", len(sources))
    print("source | host | original | canonical candidate | references")
    for key, count in sorted(counts.items()):
        print(" | ".join(key), "|", count)
    for source, count in malformed.items():
        print(source, "malformed URLs:", count)


if __name__ == "__main__":
    main()
