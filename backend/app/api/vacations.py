from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends
from pydantic import BaseModel, model_validator
from sqlalchemy.orm import Session

from ..db.models import VacationEvent
from ..db.session import SessionLocal

router = APIRouter()


class VacationCreate(BaseModel):
    name: str
    start_at: datetime
    end_at: datetime
    active: bool = True

    @model_validator(mode="after")
    def validate_range(self):
        if self.end_at <= self.start_at:
            raise ValueError("Vacation end must be after start")
        return self


class VacationResponse(VacationCreate):
    id: int

    class Config:
        from_attributes = True


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/", response_model=List[VacationResponse])
def get_vacations(db: Session = Depends(get_db)):
    return db.query(VacationEvent).order_by(VacationEvent.start_at.asc()).all()


@router.post("/", response_model=VacationResponse)
def create_vacation(vacation: VacationCreate, db: Session = Depends(get_db)):
    db_vacation = VacationEvent(**vacation.dict())
    db.add(db_vacation)
    db.commit()
    db.refresh(db_vacation)
    return db_vacation


@router.put("/{vacation_id}", response_model=VacationResponse)
def update_vacation(vacation_id: int, vacation: VacationCreate, db: Session = Depends(get_db)):
    db_vacation = db.query(VacationEvent).filter(VacationEvent.id == vacation_id).first()
    if not db_vacation:
        return {"error": "Vacation not found"}

    for key, value in vacation.dict().items():
        setattr(db_vacation, key, value)

    db.commit()
    db.refresh(db_vacation)
    return db_vacation


@router.delete("/{vacation_id}")
def delete_vacation(vacation_id: int, db: Session = Depends(get_db)):
    vacation = db.query(VacationEvent).filter(VacationEvent.id == vacation_id).first()
    if vacation:
        db.delete(vacation)
        db.commit()
    return {"status": "deleted"}
