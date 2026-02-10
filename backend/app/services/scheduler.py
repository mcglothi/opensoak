from apscheduler.schedulers.background import BackgroundScheduler
from ..db.session import SessionLocal
from ..db.models import Schedule, SystemState, Settings
from datetime import datetime

class HotTubScheduler:
    def __init__(self):
        self.scheduler = BackgroundScheduler()
        self.scheduler.add_job(self.check_schedules, 'interval', minutes=1)

    def start(self):
        self.scheduler.start()

    def stop(self):
        self.scheduler.shutdown()

    def check_schedules(self):
        db = SessionLocal()
        try:
            now = datetime.now()
            current_time = now.strftime("%H:%M")
            day_of_week = str(now.weekday())
            
            schedules = db.query(Schedule).filter(Schedule.active == True).all()
            
            for sched in schedules:
                if day_of_week in sched.days_of_week.split(','):
                    if current_time == sched.start_time:
                        self.activate_schedule(sched, db)
                    elif current_time == sched.end_time:
                        self.deactivate_schedule(sched, db)
        finally:
            db.close()

    def activate_schedule(self, sched, db):
        print(f"Activating schedule: {sched.name}")
        state = db.query(SystemState).first()
        settings = db.query(Settings).first()
        
        if state and settings:
            state.heater = True
            settings.set_point = sched.target_temp
            db.commit()

    def deactivate_schedule(self, sched, db):
        print(f"Deactivating schedule: {sched.name}")
        state = db.query(SystemState).first()
        if state:
            state.heater = False
            db.commit()

scheduler = HotTubScheduler()
