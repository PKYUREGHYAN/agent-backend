from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.command_service import understand_command
from services.comfyui_service import get_large_inpaint_status
from services.image_service import ImageProcessingError, detect_objects_in_image, get_capabilities, process_image
from services.ollama_service import get_ollama_status, plan_custom_removal


router = APIRouter()


class CommandRequest(BaseModel):
    text: str = Field(min_length=2, max_length=240)


class ProcessRequest(BaseModel):
    image_data: str = Field(min_length=32)
    command: str = Field(min_length=3, max_length=64)
    target: str | None = Field(default=None, min_length=2, max_length=60)
    selected_box: list[float] | None = None


class DetectObjectsRequest(BaseModel):
    image_data: str = Field(min_length=32)
    target: str = Field(min_length=2, max_length=120)


class CustomRemovalRequest(BaseModel):
    image_data: str = Field(min_length=32)
    text: str = Field(min_length=3, max_length=240)


@router.get("/capabilities")
def capabilities():
    return {
        "success": True,
        **get_capabilities(),
        "vision_ai": get_ollama_status(),
        "large_inpaint": get_large_inpaint_status(),
    }


@router.post("/understand-command")
def understand(request: CommandRequest):
    return {"success": True, "result": understand_command(request.text)}


@router.post("/plan-custom-removal")
def plan_removal(request: CustomRemovalRequest):
    plan = plan_custom_removal(request.image_data, request.text)
    if not plan.get("allow"):
        raise HTTPException(
            status_code=422,
            detail=plan.get("reason") or "Թիրախը հստակ չի ճանաչվել. նկարը չի փոխվել։",
        )
    return {"success": True, "command": "REMOVE_CUSTOM_OBJECT", **plan}


@router.post("/detect-objects")
def detect_objects_endpoint(request: DetectObjectsRequest):
    try:
        result = detect_objects_in_image(request.image_data, request.target)
    except ImageProcessingError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {"success": True, **result}


@router.post("/process-image")
def process(request: ProcessRequest):
    try:
        result = process_image(
            request.image_data,
            request.command,
            request.target,
            request.selected_box,
        )
    except ImageProcessingError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {"success": True, **result}
