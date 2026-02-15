from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import os

from ..db.session import SessionLocal
from ..db.models import Settings

router = APIRouter()

class SettingsUpdate(BaseModel):
    set_point: Optional[float] = None
    default_rest_temp: Optional[float] = None
    hysteresis_upper: Optional[float] = None
    hysteresis_lower: Optional[float] = None
    max_temp_limit: Optional[float] = None
    location: Optional[str] = None
    weather_provider: Optional[str] = None
    default_soak_duration: Optional[int] = None
    default_soak_temp: Optional[float] = None
    kwh_cost: Optional[float] = None
    heater_watts: Optional[float] = None
    circ_pump_watts: Optional[float] = None
    jet_pump_watts: Optional[float] = None
    light_watts: Optional[float] = None
    ozone_watts: Optional[float] = None

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

async def get_admin_status(x_admin_key: Optional[str] = Header(None)) -> bool:
    admin_key_env = os.getenv("ADMIN_API_KEY")
    
    # If ADMIN_API_KEY is not configured in environment, bypass check for dev convenience.
    # In a production environment, this variable should always be set and secured.
    if not admin_key_env:
        return True
    
    # If ADMIN_API_KEY is configured, require X-Admin-Key header to match.
    if x_admin_key == admin_key_env:
        return True
    else:
        raise HTTPException(status_code=403, detail="Unauthorized: Admin privileges required")

@router.get("/")
def get_settings(db: Session = Depends(get_db)):
    settings = db.query(Settings).first()
    return settings

@router.post("/")
def update_settings(update: SettingsUpdate, db: Session = Depends(get_db), is_admin: bool = Depends(get_admin_status)):
    settings = db.query(Settings).first()
    if not settings:
        settings = Settings()
        db.add(settings)
    
    # Fields that can be updated by any authenticated request (not strictly admin-only)
    if update.set_point is not None:
        if update.set_point > 108: # Hard safety cap for set point
             raise HTTPException(status_code=400, detail="Set point too high")
        settings.set_point = update.set_point
    
    # Fields that require `is_admin` to be True
    if not is_admin:
        admin_fields = [
            'default_rest_temp', 'hysteresis_upper', 'hysteresis_lower',
            'max_temp_limit', 'location', 'weather_provider', 'default_soak_duration',
            'default_soak_temp', 'kwh_cost', 'heater_watts',
            'circ_pump_watts', 'jet_pump_watts', 'light_watts', 'ozone_watts'
        ]
        for field in admin_fields:
            if getattr(update, field) is not None:
                raise HTTPException(status_code=403, detail=f"Unauthorized: Changing '{field}' requires admin privileges.")

    # Apply admin-only changes (will only be reached if is_admin is True or check bypassed)
    if update.default_rest_temp is not None: settings.default_rest_temp = update.default_rest_temp
    if update.hysteresis_upper is not None: settings.hysteresis_upper = update.hysteresis_upper
    if update.hysteresis_lower is not None: settings.hysteresis_lower = update.hysteresis_lower
    if update.max_temp_limit is not None: settings.max_temp_limit = update.max_temp_limit
    if update.location is not None: settings.location = update.location
    if update.weather_provider is not None: settings.weather_provider = update.weather_provider
    if update.default_soak_duration is not None: settings.default_soak_duration = update.default_soak_duration
    if update.default_soak_temp is not None: settings.default_soak_temp = update.default_soak_temp
    if update.kwh_cost is not None: settings.kwh_cost = update.kwh_cost
    if update.heater_watts is not None: settings.heater_watts = update.heater_watts
    if update.circ_pump_watts is not None: settings.circ_pump_watts = update.circ_pump_watts
    if update.jet_pump_watts is not None: settings.jet_pump_watts = update.jet_pump_watts # Fixed typo: update.jet_watts -> update.jet_pump_watts
    if update.light_watts is not None: settings.light_watts = update.light_watts
    if update.ozone_watts is not None: settings.ozone_watts = update.ozone_watts
        
    db.commit()
    db.refresh(settings)
    return settings
