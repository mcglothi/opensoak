from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from ..db.session import SessionLocal
from ..db.models import Schedule

router = APIRouter()

class ScheduleCreate(BaseModel):
    name: str
    type: str = "soak" # "soak", "clean"
    start_time: str
    end_time: str
    days_of_week: str
    target_temp: Optional[float] = None
    light_on: bool = True
    active: bool = True

class ScheduleResponse(ScheduleCreate):
    id: int

    class Config:
        from_attributes = True

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/", response_model=List[ScheduleResponse])
def get_schedules(db: Session = Depends(get_db)):
    return db.query(Schedule).all()

@router.post("/", response_model=ScheduleResponse)
def create_schedule(sched: ScheduleCreate, db: Session = Depends(get_db)):
    db_sched = Schedule(**sched.dict())
    db.add(db_sched)
    db.commit()
    db.refresh(db_sched)
    return db_sched

@router.delete("/{schedule_id}")
def delete_schedule(schedule_id: int, db: Session = Depends(get_db)):
    sched = db.query(Schedule).filter(Schedule.id == schedule_id).first()
    if sched:
        db.delete(sched)
        db.commit()
    return {"status": "deleted"}