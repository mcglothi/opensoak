from apscheduler.schedulers.background import BackgroundScheduler
from ..db.session import SessionLocal
from ..db.models import Schedule, SystemState, Settings, UsageLog
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
        print(f"Activating schedule: {sched.name} ({sched.type})")
        state = db.query(SystemState).first()
        settings = db.query(Settings).first()
        
        if not state or not settings:
            return

        event_details = f"Schedule: {sched.name}"
        if sched.type == "soak":
            # Soak: Set heat to target, turn on jets and lights
            state.heater = True
            if sched.target_temp is not None:
                settings.set_point = sched.target_temp
            state.jet_pump = True
            state.light = getattr(sched, 'light_on', True)
            event_details += f" (Temp: {sched.target_temp}F, Light: {'On' if state.light else 'Off'})"
        elif sched.type == "clean":
            state.jet_pump = True
        elif sched.type == "ozone":
            state.ozone = True
            
        log = UsageLog(event=f"{sched.type.capitalize()} Cycle Started", details=event_details)
        db.add(log)
        db.commit()

    def deactivate_schedule(self, sched, db):
        print(f"Deactivating schedule: {sched.name} ({sched.type})")
        state = db.query(SystemState).first()
        settings = db.query(Settings).first()
        
        if not state:
            return

        if sched.type == "soak":
            if settings:
                settings.set_point = settings.default_rest_temp
            state.jet_pump = False
            state.light = False
            state.heater = True 
        elif sched.type == "clean":
            state.jet_pump = False
        elif sched.type == "ozone":
            state.ozone = False
            
        log = UsageLog(event=f"{sched.type.capitalize()} Cycle Ended", details=f"Schedule: {sched.name}")
        db.add(log)
        db.commit()

scheduler = HotTubScheduler()