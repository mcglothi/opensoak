from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..db.session import SessionLocal
from ..db.models import SystemState, TemperatureLog
from ..services.engine import engine as hottub_engine

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/")
def get_status(db: Session = Depends(get_db)):
    state = db.query(SystemState).first()
    current_temp = hottub_engine.controller.get_temperature()
    relay_states = hottub_engine.controller.get_all_states()
    
    return {
        "current_temp": current_temp,
        "desired_state": state,
        "actual_relay_state": relay_states,
        "safety_status": hottub_engine.safety_status
    }

@router.get("/history")
def get_history(limit: int = 1440, db: Session = Depends(get_db)):
    logs = db.query(TemperatureLog).order_by(TemperatureLog.timestamp.desc()).limit(limit).all()
    return logs

@router.get("/logs")
def get_usage_logs(limit: int = 20, db: Session = Depends(get_db)):
    from ..db.models import UsageLog
    return db.query(UsageLog).order_by(UsageLog.timestamp.desc()).limit(limit).all()
