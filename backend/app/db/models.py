from sqlalchemy import Column, Integer, Float, Boolean, String, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func

Base = declarative_base()

class Settings(Base):
    __tablename__ = "settings"
    id = Column(Integer, primary_key=True, index=True)
    set_point = Column(Float, default=80.0) # This is the current target (Rest or Soak)
    default_rest_temp = Column(Float, default=80.0)
    hysteresis_upper = Column(Float, default=0.5)
    hysteresis_lower = Column(Float, default=1.0)
    max_temp_limit = Column(Float, default=110.0)
    location = Column(String, default="90210") # Zip code for weather
    default_soak_duration = Column(Integer, default=60)
    default_soak_temp = Column(Float, default=104.0)
    
    # Energy Settings
    kwh_cost = Column(Float, default=0.12) # Price in $ per kWh
    heater_watts = Column(Float, default=5500.0)
    circ_pump_watts = Column(Float, default=250.0)
    jet_pump_watts = Column(Float, default=1500.0)
    light_watts = Column(Float, default=20.0)
    ozone_watts = Column(Float, default=50.0)

class TemperatureLog(Base):
    __tablename__ = "temperature_logs"
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    value = Column(Float)

class UsageLog(Base):
    __tablename__ = "usage_logs"
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    event = Column(String) # e.g. "Soak Started", "Heater On", "Fault Detected"
    details = Column(String, nullable=True)

class EnergyLog(Base):
    __tablename__ = "energy_logs"
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    component = Column(String) # "heater", "circ_pump", etc.
    runtime_seconds = Column(Float, default=0.0)
    kwh_used = Column(Float, default=0.0)
    estimated_cost = Column(Float, default=0.0)

class Schedule(Base):
    __tablename__ = "schedules"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    type = Column(String, default="soak") # "soak", "clean"
    start_time = Column(String) # HH:MM
    end_time = Column(String)   # HH:MM
    days_of_week = Column(String) # "0,1,2,3,4,5,6" (Monday=0)
    target_temp = Column(Float, nullable=True)
    light_on = Column(Boolean, default=True) # User choice for soak cycles
    active = Column(Boolean, default=True)

class SystemState(Base):
    """Stores the desired state (e.g. if the user turned the light on)"""
    __tablename__ = "system_state"
    id = Column(Integer, primary_key=True, index=True)
    circ_pump = Column(Boolean, default=True)
    heater = Column(Boolean, default=False)
    jet_pump = Column(Boolean, default=False)
    light = Column(Boolean, default=False)
    ozone = Column(Boolean, default=False)
    
    # Manual Soak
    manual_soak_active = Column(Boolean, default=False)
    manual_soak_expires = Column(DateTime(timezone=True), nullable=True)
