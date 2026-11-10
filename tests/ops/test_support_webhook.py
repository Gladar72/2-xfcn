import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
import urllib.error
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("support_webhook", Path(__file__).parents[2] / "deploy/yandex/support-webhook.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def response(result):
    return io.BytesIO(json.dumps({"ok": True, "result": result}).encode())


class WebhookRepairTest(unittest.TestCase):
    def env(self, directory):
        path = Path(directory) / ".env"
        path.write_text("TELEGRAM_API_ROOT=https://tg.mesto-go.ru/api/telegram/relay\nTELEGRAM_BOT_TOKEN=test\nTELEGRAM_WEBHOOK_SECRET=test-secret\n")
        return path

    def test_preserves_queue_and_authentication(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.env(directory)
            with patch.object(module.sys, "argv", ["script", str(path)]), patch.object(module.subprocess, "run") as run, patch.object(module.urllib.request, "urlopen") as fetch:
                run.return_value.stdout = "t\n"
                fetch.side_effect = [
                    response({"url": "https://mesto-go.ru/api/telegram/webhook", "pending_update_count": 1, "last_error_message": "Connection timed out"}),
                    urllib.error.HTTPError("https://tg.mesto-go.ru/api/telegram/webhook", 401, "Unauthorized", {}, None),
                    response(True), response({"pending_update_count": 0}),
                ]
                module.main()
                payload = module.urllib.parse.parse_qs(fetch.call_args_list[2].kwargs["data"].decode())
                self.assertEqual(payload["drop_pending_updates"], ["false"])
                self.assertEqual(payload["secret_token"], ["test-secret"])
                self.assertEqual(payload["url"], ["https://tg.mesto-go.ru/api/telegram/webhook"])
                self.assertIn("TELEGRAM_WEBHOOK_URL=https://tg.mesto-go.ru/api/telegram/webhook", path.read_text())
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_refuses_unprotected_forwarding_route(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.env(directory)
            unprotected = io.BytesIO(b"ok")
            unprotected.status = 200
            with patch.object(module.sys, "argv", ["script", str(path)]), patch.object(module.urllib.request, "urlopen") as fetch:
                fetch.side_effect = [response({"pending_update_count": 1, "last_error_message": "Connection timed out"}), unprotected]
                with self.assertRaisesRegex(RuntimeError, "not verified"):
                    module.main()
                self.assertEqual(fetch.call_count, 2)
                self.assertNotIn("TELEGRAM_WEBHOOK_URL", path.read_text())

    def test_does_not_change_a_healthy_webhook(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.env(directory)
            with patch.object(module.sys, "argv", ["script", str(path)]), patch.object(module.urllib.request, "urlopen", return_value=response({"pending_update_count": 0})) as fetch:
                module.main()
                self.assertEqual(fetch.call_count, 1)
                self.assertNotIn("TELEGRAM_WEBHOOK_URL", path.read_text())


if __name__ == "__main__":
    unittest.main()
