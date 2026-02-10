from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from ..db.session import SessionLocal
from ..db.models import SystemState
from ..services.engine import engine as hottub_engine

router = APIRouter()

class ControlUpdate(BaseModel):
    circ_pump: bool = None
    heater: bool = None
    jet_pump: bool = None
    light: bool = None
    ozone: bool = None

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

@router.post("/reset-faults")
def reset_faults():
    hottub_engine.reset_faults()
    return {"status": "faults reset"}