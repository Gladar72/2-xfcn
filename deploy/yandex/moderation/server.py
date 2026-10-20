"""
Проверка фото на наготу — на нашем сервере в РФ, без внешних сервисов.
Модель NudeNet (открытая, ONNX) ищет на фото открытые интимные части тела.

POST /check  (тело — байты картинки)  →  {"safe": true} | {"safe": false, "reason": "nudity", "found": [...]}
GET  /health →  ok
"""
import io
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
from nudenet import NudeDetector
from PIL import Image, ImageOps

# Что считаем недопустимым и с какой уверенностью.
BLOCK = {
    "FEMALE_GENITALIA_EXPOSED": 0.4,
    "MALE_GENITALIA_EXPOSED": 0.4,
    "ANUS_EXPOSED": 0.4,
    "FEMALE_BREAST_EXPOSED": 0.5,
    "BUTTOCKS_EXPOSED": 0.6,
}
MAX_BYTES = 15 * 1024 * 1024

detector = NudeDetector()


def check(data: bytes) -> dict:
    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img).convert("RGB")
    img.thumbnail((1280, 1280))
    bgr = np.ascontiguousarray(np.array(img)[:, :, ::-1])
    found = [
        {"class": d["class"], "score": round(float(d["score"]), 3)}
        for d in detector.detect(bgr)
        if d["class"] in BLOCK and d["score"] >= BLOCK[d["class"]]
    ]
    return {"safe": False, "reason": "nudity", "found": found} if found else {"safe": True}


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: dict | str):
        raw = body.encode() if isinstance(body, str) else json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "text/plain" if isinstance(body, str) else "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        self._send(200, "ok") if self.path == "/health" else self._send(404, "not found")

    def do_POST(self):
        if self.path != "/check":
            return self._send(404, "not found")
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > MAX_BYTES:
            return self._send(400, {"error": "bad size"})
        try:
            self._send(200, check(self.rfile.read(n)))
        except Exception as e:  # битая картинка и т. п.
            self._send(422, {"error": str(e)[:200]})

    def log_message(self, *args):  # без логов на каждый запрос (в них нет нужды)
        pass


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
