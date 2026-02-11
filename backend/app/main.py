from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

load_dotenv()

from .db.session import init_db
from .services.engine import engine as hottub_engine
from .services.scheduler import scheduler as hottub_scheduler
from .api import status, settings, control, schedules, support

app = FastAPI(title="OpenSoak API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_event():
    init_db()
    hottub_engine.start()
    hottub_scheduler.start()

@app.on_event("shutdown")
def shutdown_event():
    hottub_engine.stop()
    hottub_scheduler.stop()

app.include_router(status.router, prefix="/api/status", tags=["status"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(control.router, prefix="/api/control", tags=["control"])
app.include_router(schedules.router, prefix="/api/schedules", tags=["schedules"])
app.include_router(support.router, prefix="/api/support", tags=["support"])

@app.get("/")
def read_root():
    return {"message": "OpenSoak API is running"}
