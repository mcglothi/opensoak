from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..db.session import SessionLocal
import httpx
from ..db.models import SystemState, TemperatureLog, Settings
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

@router.get("/weather")
async def get_weather(db: Session = Depends(get_db)):
    settings = db.query(Settings).first()
    if not settings or not settings.location:
        return {"error": "Location not set"}
    
    try:
        # 1. Geocode Location
        geo_url = f"https://geocoding-api.open-meteo.com/v1/search?name={settings.location}&count=1&language=en&format=json"
        async with httpx.AsyncClient() as client:
            geo_res = await client.get(geo_url)
            geo_data = geo_res.json()
            
            if not geo_data.get("results"):
                return {"error": "Location not found"}
            
            lat = geo_data["results"][0]["latitude"]
            lon = geo_data["results"][0]["longitude"]
            city = geo_data["results"][0]["name"]

            # 2. Get Weather
            weather_url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,is_day,weather_code&hourly=temperature_2m,precipitation_probability,wind_speed_10m,wind_direction_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=7"
            weather_res = await client.get(weather_url)
            weather_data = weather_res.json()
            
            return {
                "city": city,
                "current": weather_data["current"],
                "hourly": weather_data["hourly"],
                "daily": weather_data["daily"]
            }
    except Exception as e:
        return {"error": str(e)}

@router.get("/history")
def get_history(limit: int = 1440, db: Session = Depends(get_db)):
    logs = db.query(TemperatureLog).order_by(TemperatureLog.timestamp.desc()).limit(limit).all()
    return logs

@router.get("/logs")
def get_usage_logs(limit: int = 20, db: Session = Depends(get_db)):
    from ..db.models import UsageLog
    return db.query(UsageLog).order_by(UsageLog.timestamp.desc()).limit(limit).all()

def get_summary_no_live(start_date, end_date):
    from ..db.models import EnergyLog
    from sqlalchemy import func
    db = SessionLocal()
    try:
        rows = db.query(
            EnergyLog.component,
            func.sum(EnergyLog.kwh_used).label("kwh"),
            func.sum(EnergyLog.estimated_cost).label("cost"),
            func.sum(EnergyLog.runtime_seconds).label("runtime")
        ).filter(EnergyLog.timestamp >= start_date, EnergyLog.timestamp < end_date).group_by(EnergyLog.component).all()
        return {r.component: {"kwh": r.kwh, "cost": r.cost, "runtime": r.runtime} for r in rows}
    finally:
        db.close()

@router.get("/energy")
def get_energy_stats(db: Session = Depends(get_db)):
    from ..db.models import EnergyLog
    from sqlalchemy import func
    from datetime import datetime, timedelta
    
    settings = db.query(Settings).first()
    if not settings:
        return {"error": "Settings not initialized"}

    today = datetime.now().date()
    yesterday = today - timedelta(days=1)
    month_start = today.replace(day=1)
    
    power_map = {
        "heater": settings.heater_watts,
        "circ_pump": settings.circ_pump_watts,
        "jet_pump": settings.jet_pump_watts,
        "light": settings.light_watts,
        "ozone": settings.ozone_watts
    }

    def get_historical_summary(start_date):
        rows = db.query(
            EnergyLog.component,
            func.sum(EnergyLog.kwh_used).label("kwh"),
            func.sum(EnergyLog.estimated_cost).label("cost"),
            func.sum(EnergyLog.runtime_seconds).label("runtime")
        ).filter(EnergyLog.timestamp >= start_date).group_by(EnergyLog.component).all()
        return {r.component: {"kwh": r.kwh, "cost": r.cost, "runtime": r.runtime} for r in rows}

    memory_runtimes = hottub_engine.runtimes 
    
    def get_live_summary(start_date):
        history = get_historical_summary(start_date)
        comp_date = start_date.date() if isinstance(start_date, datetime) else start_date

        if comp_date <= today:
            for component, seconds in memory_runtimes.items():
                if component not in history:
                    history[component] = {"kwh": 0.0, "cost": 0.0, "runtime": 0.0}
                
                watts = power_map.get(component, 0)
                live_kwh = (watts * (seconds / 3600)) / 1000
                live_cost = live_kwh * settings.kwh_cost
                
                history[component]["kwh"] += live_kwh
                history[component]["cost"] += live_cost
                history[component]["runtime"] += seconds
        return history

    return {
        "today": get_live_summary(today),
        "yesterday": get_summary_no_live(yesterday, today),
        "month": get_live_summary(month_start),
        "all_time": get_live_summary(datetime(2000, 1, 1))
    }
