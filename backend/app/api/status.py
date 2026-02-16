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
        "safety_status": hottub_engine.safety_status,
        "system_locked": hottub_engine.system_locked
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

@router.get("/heating-stats")
def get_heating_stats(db: Session = Depends(get_db)):
    from ..db.models import HeatingEvent, Schedule
    from sqlalchemy import func
    from datetime import datetime, timedelta
    
    # 1. Avg Thermal Rates
    avg_heat_rate = db.query(func.avg(HeatingEvent.efficiency_score)).filter(HeatingEvent.event_type == 'heat').scalar() or 4.0
    avg_cool_rate = db.query(func.avg(HeatingEvent.efficiency_score)).filter(HeatingEvent.event_type == 'cool').scalar() or -1.5
    
    # 2. Histogram Data (Last 10 events)
    events = db.query(HeatingEvent).order_by(HeatingEvent.timestamp.desc()).limit(15).all()
    histogram = [{
        "time": e.timestamp.strftime("%m/%d %H:%M"),
        "rate": round(abs(e.efficiency_score), 2),
        "type": e.event_type,
        "outside": e.outside_temp
    } for e in reversed(events)]

    # 3. Monthly Forecast Calculation
    settings = db.query(Settings).first()
    schedules = db.query(Schedule).filter(Schedule.active == True).all()
    
    forecast_total = 0.0
    if settings:
        now = datetime.now()
        days_in_month = 28 # Simplified for Feb or use calendar.monthrange
        days_left = days_in_month - now.day
        
        # Power per hour
        circ_cost_hr = (settings.circ_pump_watts / 1000) * settings.kwh_cost
        heater_cost_hr = (settings.heater_watts / 1000) * settings.kwh_cost
        
        # Fixed Daily (Circ runs 24/7)
        daily_fixed = circ_cost_hr * 24
        
        # Schedule Impact (Heater burner time estimate)
        daily_soak_heater_hrs = 0
        for s in schedules:
            if s.type == "soak":
                start_h = int(s.start_time.split(':')[0])
                end_h = int(s.end_time.split(':')[0])
                duration = end_h - start_h if end_h > start_h else (24 - start_h + end_h)
                # Estimate: Heater runs 40% of the time during soak sessions to fight loss
                daily_soak_heater_hrs += duration * 0.4
        
        # Maintenance Impact (Heater fighting natural cooling)
        # Fighting avg_cool_rate loss 24/7 (minus soak time)
        # burner_hrs_needed = abs(avg_cool_rate) / avg_heat_rate
        maintenance_duty_cycle = abs(avg_cool_rate) / avg_heat_rate
        daily_maint_heater_hrs = (24 - daily_soak_heater_hrs) * maintenance_duty_cycle
        
        total_daily_est = daily_fixed + ((daily_soak_heater_hrs + daily_maint_heater_hrs) * heater_cost_hr)
        forecast_total = total_daily_est * days_in_month

    return {
        "avg_heat_rate": round(avg_heat_rate, 2),
        "avg_cool_rate": round(avg_cool_rate, 2),
        "estimated_time_to_104": round((104.0 - hottub_engine.controller.get_temperature()) / avg_heat_rate, 1) if avg_heat_rate > 0 else 0,
        "hourly_loss_at_rest": round(abs(avg_cool_rate), 2),
        "histogram": histogram,
        "projected_monthly_cost": round(forecast_total, 2)
    }

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
