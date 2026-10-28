import base64
import io
import unittest
from unittest.mock import patch

from PIL import Image

from services.image_service import ImageProcessingError, get_capabilities, process_image


def image_data_url():
    buffer = io.BytesIO()
    Image.new("RGB", (24, 24), (120, 140, 160)).save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


class ImageServiceTests(unittest.TestCase):
    def setUp(self):
        self.image_data = image_data_url()
        self.image = Image.new("RGB", (24, 24), (120, 140, 160))

    @patch("services.image_service.lama_inpaint")
    @patch("services.image_service.make_mask", return_value=(object(), 0.04))
    @patch("services.image_service.review_target", return_value={"allow": True})
    def test_small_object_mask_uses_lama(self, _review, _mask, lama):
        lama.return_value = self.image.copy()
        result = process_image(self.image_data, "REMOVE_BOTTLES")
        self.assertEqual(result["engine"], "iopaint-lama")
        self.assertTrue(result["processed_image"].startswith("data:image/jpeg;base64,"))
        self.assertGreaterEqual(lama.call_count, 1)

    @patch("services.image_service.comfy_inpaint")
    @patch("services.image_service.get_comfyui_status", return_value={"available": False, "reason": "ComfyUI unavailable"})
    @patch("services.image_service.make_mask", return_value=(object(), 0.2))
    @patch("services.image_service.review_target", return_value={"allow": True})
    def test_large_mask_fails_safely_without_comfyui(self, _review, _mask, _status, comfy):
        with self.assertRaisesRegex(ImageProcessingError, "մեծ է LaMa-ի համար"):
            process_image(self.image_data, "REMOVE_PEOPLE")
        comfy.assert_not_called()

    @patch("services.image_service.lama_inpaint")
    @patch("services.image_service.lama_status", return_value={"available": True, "reason": ""})
    @patch("services.image_service.get_comfyui_status", return_value={"available": False, "reason": "ComfyUI unavailable"})
    @patch("services.image_service.make_mask", return_value=(object(), 0.04))
    def test_wall_repair_uses_lama_without_comfyui(self, _mask, _status, _lama_status, lama):
        lama.return_value = self.image.copy()
        result = process_image(self.image_data, "REPAIR_WALLS")
        self.assertEqual(result["engine"], "iopaint-lama")
        lama.assert_called_once()

    @patch("services.image_service.get_comfyui_status", return_value={"available": False, "reason": "ComfyUI unavailable"})
    @patch("services.image_service.make_mask")
    def test_tablecloth_uses_local_overlay_without_comfyui(self, make_mask, _status):
        import numpy as np

        mask = np.zeros((24, 24), dtype=np.uint8)
        mask[8:16, 4:20] = 1
        make_mask.return_value = (mask, 0.08)
        result = process_image(self.image_data, "ADD_TABLECLOTH")
        self.assertEqual(result["engine"], "local-tablecloth")
        self.assertTrue(result["processed_image"].startswith("data:image/jpeg;base64,"))

    def test_furniture_removal_is_blocked(self):
        with self.assertRaisesRegex(ImageProcessingError, "կոնկրետ գույք"):
            process_image(self.image_data, "REMOVE_FURNITURE")

    @patch("services.image_service.realesrgan_status", return_value={"available": False, "reason": "weights missing"})
    def test_upscale_requires_installed_weights(self, _status):
        with self.assertRaisesRegex(ImageProcessingError, "weights missing"):
            process_image(self.image_data, "UPSCALE_IMAGE")

    @patch("services.image_service.get_runtime_profile")
    @patch("services.image_service.detection_status", return_value={"available": True, "reason": ""})
    @patch("services.image_service.lama_status", return_value={"available": True, "reason": ""})
    def test_low_free_ram_disables_removal_capability(self, _lama, _detector, runtime):
        runtime.return_value = {
            "name": "low-memory",
            "total_ram_gib": 7.7,
            "available_ram_gib": 0.9,
            "detection_max_dimension": 768,
            "lama_max_dimension": 512,
            "min_free_for_removal_gib": 2.25,
            "object_removal_ready": False,
        }
        caps = get_capabilities()
        self.assertNotIn("REMOVE_BOTTLES", caps["supported_commands"])
        self.assertIn("RAM", caps["unavailable_commands"]["REMOVE_BOTTLES"])
        self.assertEqual(caps["runtime"]["name"], "low-memory")


if __name__ == "__main__":
    unittest.main()
