"""Add the isolated API under the existing application host, keeping other routes intact."""
import sys
from pathlib import Path
source, dest = map(Path, sys.argv[1:3])
original = source.read_text()
route = """	handle_path /ticket-test/* {
		reverse_proxy 127.0.0.1:3087 {
			header_up -Cookie
			header_down -Set-Cookie
		}
	}
"""
anchor = "\treverse_proxy 127.0.0.1:3000\n"
if route in original:
    dest.write_text(original)
elif original.count(anchor) == 1 and "/ticket-test/" not in original:
    dest.write_text(original.replace(anchor, route + anchor))
else:
    raise SystemExit("Application proxy configuration has changed; current routes were preserved")
