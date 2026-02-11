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
    circ_pump = Column(Boolean, default=False)
    heater = Column(Boolean, default=False)
    jet_pump = Column(Boolean, default=False)
    light = Column(Boolean, default=False)
    ozone = Column(Boolean, default=False)
