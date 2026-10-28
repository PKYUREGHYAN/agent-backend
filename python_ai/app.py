from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import router


app = FastAPI(title="Agent 1 Local Photo AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[],
    allow_origin_regex=(
        r"^https?://("
        r"localhost|127\.0\.0\.1|"
        r"10(?:\.\d{1,3}){3}|"
        r"192\.168(?:\.\d{1,3}){2}|"
        r"172\.(1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}"
        r")(:\d+)?$"
    ),
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(router, prefix="/api/ai")


@app.get("/")
def health():
    return {"success": True, "service": "agent-1-photo-ai"}
