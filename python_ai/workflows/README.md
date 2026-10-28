# ComfyUI workflow setup

ComfyUI is optional and is not bundled with the Python service. On a GPU-backed machine:

1. Build a ComfyUI inpainting workflow using either SDXL Inpaint or FLUX Fill.
2. Export it with **Save (API Format)** into the path configured by `COMFYUI_WORKFLOW_PATH`.
3. Create the JSON node map at `COMFYUI_NODE_MAP_PATH`.
4. Set ComfyUI's base URL in `.env` and verify `GET /system_stats` responds.

The node-map format is:

```json
{
  "image": { "node": "LOAD_IMAGE_NODE_ID", "input": "image" },
  "mask": { "node": "MASK_INPUT_NODE_ID", "input": "image" },
  "positive_prompt": { "node": "POSITIVE_TEXT_NODE_ID", "input": "text" },
  "negative_prompt": { "node": "NEGATIVE_TEXT_NODE_ID", "input": "text" },
  "seed": { "node": "SAMPLER_NODE_ID", "input": "seed" },
  "output_nodes": ["SAVE_IMAGE_NODE_ID"]
}
```

Node IDs and input names must match the exported workflow exactly. Keep local workflows out of source control until reviewed; do not include API keys in the workflow file.
