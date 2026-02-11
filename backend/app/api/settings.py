from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from ..db.session import SessionLocal
from ..db.models import Settings

router = APIRouter()

class SettingsUpdate(BaseModel):
    set_point: float = None
    default_rest_temp: float = None
    hysteresis_upper: float = None
    hysteresis_lower: float = None
    max_temp_limit: float = None

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/")
def get_settings(db: Session = Depends(get_db)):
    settings = db.query(Settings).first()
    return settings

@router.post("/")
def update_settings(update: SettingsUpdate, db: Session = Depends(get_db)):
    settings = db.query(Settings).first()
    if not settings:
        settings = Settings()
        db.add(settings)
    
    if update.set_point is not None:
        if update.set_point > 108: # Hard safety cap for set point
             raise HTTPException(status_code=400, detail="Set point too high")
        settings.set_point = update.set_point
    
    if update.default_rest_temp is not None:
        settings.default_rest_temp = update.default_rest_temp

    if update.hysteresis_upper is not None:
        settings.hysteresis_upper = update.hysteresis_upper
    if update.hysteresis_lower is not None:
        settings.hysteresis_lower = update.hysteresis_lower
    if update.max_temp_limit is not None:
        settings.max_temp_limit = update.max_temp_limit
        
    db.commit()
    db.refresh(settings)
    return settings