from fastapi import FastAPI
from .routers import health, sample

app = FastAPI(title="Service", version="0.1.0")
app.include_router(health.router, prefix="/health", tags=["health"])
app.include_router(sample.router, prefix="/sample", tags=["sample"])
