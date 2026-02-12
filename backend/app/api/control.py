from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from ..db.session import SessionLocal
from ..db.models import SystemState, UsageLog, Settings
from ..services.engine import engine as hottub_engine

from datetime import datetime, timedelta

router = APIRouter()

class ControlUpdate(BaseModel):
    circ_pump: bool = None
    heater: bool = None
    jet_pump: bool = None
    light: bool = None
    ozone: bool = None

class SoakStart(BaseModel):
    target_temp: float
    duration_minutes: int = 60

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/")
def update_control(update: ControlUpdate, db: Session = Depends(get_db)):
    state = db.query(SystemState).first()
    if not state:
        state = SystemState()
        db.add(state)
    
    if update.circ_pump is not None: state.circ_pump = update.circ_pump
    if update.heater is not None: state.heater = update.heater
    if update.jet_pump is not None: state.jet_pump = update.jet_pump
    if update.light is not None: state.light = update.light
    if update.ozone is not None: state.ozone = update.ozone
    
    db.commit()
    db.refresh(state)
    return state

@router.post("/start-soak")
def start_soak(soak: SoakStart, db: Session = Depends(get_db)):
    state = db.query(SystemState).first()
    settings = db.query(Settings).first()
    
    if not state or not settings:
        raise HTTPException(status_code=500, detail="System configuration missing")

    duration = soak.duration_minutes if soak.duration_minutes else settings.default_soak_duration

    # Update state
    state.manual_soak_active = True
    state.manual_soak_expires = datetime.now() + timedelta(minutes=duration)
    # state.jet_pump = True  # Removed per user request
    # state.light = True     # Removed per user request
    state.heater = True
    
    # Update target temp
    settings.set_point = soak.target_temp
    
    log = UsageLog(event="Manual Soak Started", details=f"Target: {soak.target_temp}F, Duration: {duration}m")
    db.add(log)
    db.commit()
    
    return {"status": "soak started", "expires": state.manual_soak_expires}

@router.post("/cancel-soak")
def cancel_soak(db: Session = Depends(get_db)):
    state = db.query(SystemState).first()
    settings = db.query(Settings).first()
    
    if not state or not settings:
        raise HTTPException(status_code=500, detail="System configuration missing")

    state.manual_soak_active = False
    state.manual_soak_expires = None
    state.jet_pump = False
    state.light = False
    
    settings.set_point = settings.default_rest_temp
    
    log = UsageLog(event="Manual Soak Cancelled", details="User terminated soak session")
    db.add(log)
    db.commit()
    
    return {"status": "soak cancelled", "reverted_to": settings.default_rest_temp}

@router.post("/reset-faults")
def reset_faults(db: Session = Depends(get_db)):
    hottub_engine.reset_faults()
    log = UsageLog(event="System Reset", details="Faults cleared by admin")
    db.add(log)
    db.commit()
    return {"status": "faults reset"}

@router.post("/master-shutdown")
def master_shutdown(db: Session = Depends(get_db)):
    state = db.query(SystemState).first()
    if state:
        state.circ_pump = False
        state.heater = False
        state.jet_pump = False
        state.light = False
        state.ozone = False
        db.commit()
    
    hottub_engine.controller.emergency_shutdown()
    hottub_engine.system_locked = True
    hottub_engine.safety_status = "STOP: MASTER SHUTDOWN"
    
        log = UsageLog(event="Master Shutdown", details="System emergency stop executed by admin")
    
        db.add(log)
    
        db.commit()
    
        
    
        return {"status": "all systems off and locked"}
    
    
    
    @router.post("/update-system")
    
    def update_system():
    
        import subprocess
    
        try:
    
            # Pull latest code
    
            subprocess.check_call(["git", "pull", "origin", "main"])
    
            # In a real systemd environment, we would restart the service
    
            # subprocess.Popen(["sudo", "systemctl", "restart", "opensoak"])
    
            return {"status": "update pulled", "message": "Code updated. Please restart service manually if not running via systemd."}
    
        except Exception as e:
    
            raise HTTPException(status_code=500, detail=f"Update failed: {str(e)}")
    
    