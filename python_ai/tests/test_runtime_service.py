import unittest
from types import SimpleNamespace
from unittest.mock import patch

from services.runtime_service import GIB, get_runtime_profile


class RuntimeProfileTests(unittest.TestCase):
    @patch("services.runtime_service.psutil.virtual_memory")
    def test_8gb_machine_uses_small_low_memory_profile(self, memory):
        memory.return_value = SimpleNamespace(total=7.7 * GIB, available=3 * GIB)
        profile = get_runtime_profile()
        self.assertEqual(profile["name"], "low-memory")
        self.assertEqual(profile["detection_max_dimension"], 768)
        self.assertEqual(profile["lama_max_dimension"], 512)
        self.assertTrue(profile["object_removal_ready"])

    @patch("services.runtime_service.psutil.virtual_memory")
    def test_insufficient_free_ram_disables_object_removal(self, memory):
        memory.return_value = SimpleNamespace(total=7.7 * GIB, available=0.8 * GIB)
        profile = get_runtime_profile()
        self.assertFalse(profile["object_removal_ready"])
        self.assertEqual(profile["min_free_for_removal_gib"], 2.25)

    @patch("services.runtime_service.psutil.virtual_memory")
    def test_higher_memory_selects_larger_model_inputs(self, memory):
        memory.return_value = SimpleNamespace(total=32 * GIB, available=12 * GIB)
        profile = get_runtime_profile()
        self.assertEqual(profile["name"], "high-memory")
        self.assertGreater(profile["detection_max_dimension"], 768)
        self.assertGreater(profile["lama_max_dimension"], 512)


if __name__ == "__main__":
    unittest.main()
