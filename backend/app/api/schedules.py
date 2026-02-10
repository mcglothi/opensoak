from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
from ..db.session import SessionLocal
from ..db.models import Schedule

router = APIRouter()

class ScheduleCreate(BaseModel):
    name: str
    start_time: str
    end_time: str
    days_of_week: str
    target_temp: float
    active: bool = True

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/", response_model=List[ScheduleCreate])
def get_schedules(db: Session = Depends(get_db)):
    return db.query(Schedule).all()

@router.post("/")
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
