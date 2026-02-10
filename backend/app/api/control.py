from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from ..db.session import SessionLocal
from ..db.models import SystemState

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
