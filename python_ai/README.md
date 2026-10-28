# Agent 1 Local Photo AI

Local-first API for real-estate photo editing. No paid AI API is used by default.

## Pipeline

1. Qwen3-VL through Ollama routes natural Armenian/English instructions and reviews object-removal requests. Clear common commands use a local fast matcher.
2. Grounding DINO finds the requested object; SAM2 creates its mask.
3. Small object masks (up to 12% of the image) use IOPaint + LaMa.
4. Wall repair and larger masks require a configured ComfyUI API workflow using SDXL Inpaint or FLUX Fill. They fail safely and leave the source unchanged when ComfyUI/workflow is unavailable.
5. Real-ESRGAN is an optional, separate upscale command. It never removes objects.

## Runtime

The current Windows setup reuses `../iopaint/.venv`, which contains the CPU PyTorch, SAM2, Transformers and IOPaint packages. SAM2 weights stay in `../grounded_sam/checkpoints`. The API does not copy or delete either directory.

Start the Python API from the project root:

```powershell
.\python_ai\start-ai.ps1
```

The API listens on `http://127.0.0.1:8000`. Browser development origins on `localhost` and `127.0.0.1`, on any port, are allowed.

Ollama must be running with the configured vision model:

```powershell
ollama pull qwen3-vl:4b-instruct
```

Copy `.env.example` to `.env` only if changing the defaults. Never commit `.env`.

## ComfyUI Large Inpaint

ComfyUI is a separate service. Set `COMFYUI_URL` to its API endpoint, export an API-format workflow, and supply a node map at `COMFYUI_NODE_MAP_PATH`. The map must identify the workflow node/input pairs for `image`, `mask`, `positive_prompt`, and `negative_prompt`, and list the node IDs that return the final image under `output_nodes`. Set a `seed` node/input pair optionally.

An example map shape is documented in `workflows/README.md`. Do not mark the stage available until the workflow and map files exist and ComfyUI responds to `/system_stats`. SDXL Inpaint is the first recommended workflow for a GPU host; FLUX Fill can be selected in ComfyUI if that host has enough VRAM.

## Real-ESRGAN Upscaling

Upscaling stays disabled until both the `realesrgan`/`basicsr` Python packages and a compatible `RealESRGAN_x4plus.pth` weight are installed. Set `REALESRGAN_WEIGHTS` to that local file. The optional package list is in `requirements-realesrgan.txt`; it is intentionally separate from the main runtime because BasicSR can conflict with newer Torch/TorchVision versions.

## API

- `GET /api/ai/capabilities`: report ready/unavailable engines and quick commands.
- `POST /api/ai/understand-command`: choose one action from text.
- `POST /api/ai/plan-custom-removal`: inspect one image/request and return a safe target.
- `POST /api/ai/process-image`: execute a command on an image data URL.

Run lightweight routing/safety tests with:

```powershell
Push-Location .\python_ai
..\iopaint\.venv\Scripts\python.exe -m unittest discover -s tests -v
Pop-Location
```

## Adaptive RAM profiles

The API reads total and currently available physical RAM on each capability check. On machines below 12 GB it selects `low-memory`: DINO/SAM2 detection is limited to a 768 px long edge and LaMa to 512 px before restoring the result to the original dimensions. At least 2.25 GB must currently be free before object-removal tools are enabled. If less is free, removal is disabled with the exact RAM requirement; Pillow lighting/basic enhancement remains available. Close other memory-heavy applications and refresh the page to re-evaluate.

Qwen is only called for contextual commands or visual review and is requested with `keep_alive: 0`. Calls are skipped when less than 3.5 GB is free, avoiding an LLM load competing with image models. Common commands continue through the fast local Armenian/English matcher.

Balanced (12-24 GB total RAM) uses a 1024 px detection edge and 768 px LaMa edge. High-memory (24 GB+) uses 1280 px and 1024 px respectively. The free-RAM gate still applies in every profile. SDXL/FLUX should run on a separate GPU-backed ComfyUI host; this computer's integrated graphics are not suitable for practical local SDXL inference.
