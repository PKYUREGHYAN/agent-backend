import unittest
from unittest.mock import patch

from services.command_service import understand_command


class CommandServiceTests(unittest.TestCase):
    def test_common_armenian_command_uses_fast_local_match(self):
        result = understand_command("Հեռացնել շշերը")
        self.assertEqual(result["command"], "REMOVE_BOTTLES")
        self.assertEqual(result["engine"], "local-rule-parser")

    @patch("services.command_service.ask_json")
    def test_preservation_context_is_sent_to_qwen(self, ask_json):
        ask_json.return_value = {
            "command": "IMPROVE_LIGHTING",
            "confidence": 0.95,
            "instruction": "Brighten the room and preserve the furniture.",
        }
        result = understand_command("Make it brighter but keep the furniture")
        self.assertEqual(result["command"], "IMPROVE_LIGHTING")
        self.assertEqual(result["engine"], "qwen3-vl:4b-instruct")
        ask_json.assert_called_once()

    @patch("services.command_service.ask_json")
    def test_multiple_edits_can_be_rejected(self, ask_json):
        ask_json.return_value = {"command": "UNKNOWN", "confidence": 0.99}
        result = understand_command("Remove people and brighten the room")
        self.assertEqual(result["command"], "UNKNOWN")


if __name__ == "__main__":
    unittest.main()
