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
        # Initial check on startup to catch up
        self.check_schedules(is_startup=True)

    def stop(self):
        self.scheduler.shutdown()

    def is_in_window(self, start_str, end_str):
        try:
            now = datetime.now()
            start_h, start_m = map(int, start_str.split(':'))
            end_h, end_m = map(int, end_str.split(':'))
            
            # Create datetime objects for today
            start_dt = now.replace(hour=start_h, minute=start_m, second=0, microsecond=0)
            end_dt = now.replace(hour=end_h, minute=end_m, second=0, microsecond=0)
            
            # Handle overnight windows
            if end_dt < start_dt:
                if now < end_dt: # We are in the early morning part of the window
                    start_dt = start_dt.replace(day=now.day - 1)
                else: # We are in the evening part of the window
                    end_dt = end_dt.replace(day=now.day + 1)
            
            return start_dt <= now < end_dt
        except:
            return False

    def check_schedules(self, is_startup=False):
        db = SessionLocal()
        try:
            now = datetime.now()
            current_time = now.strftime("%H:%M")
            day_of_week = str(now.weekday())
            
            state = db.query(SystemState).first()
            schedules = db.query(Schedule).filter(Schedule.active == True).all()
            
            for sched in schedules:
                days = sched.days_of_week.split(',')
                if day_of_week in days:
                    # Regular time-based triggers
                    if current_time == sched.start_time:
                        self.activate_schedule(sched, db)
                    elif current_time == sched.end_time:
                        self.deactivate_schedule(sched, db)
                    # Startup/Resume logic: If we are in the window but system says inactive, catch up
                    elif is_startup and self.is_in_window(sched.start_time, sched.end_time):
                        if state and not state.scheduled_session_active:
                            print(f"Startup catch-up: Resuming {sched.name}")
                            self.activate_schedule(sched, db)
        finally:
            db.close()

    def activate_schedule(self, sched, db):
        print(f"Activating schedule: {sched.name} ({sched.type})")
        state = db.query(SystemState).first()
        settings = db.query(Settings).first()
        
        if not state or not settings:
            return

        # Calculate expiry for countdown
        now = datetime.now()
        try:
            end_h, end_m = map(int, sched.end_time.split(':'))
            expiry = now.replace(hour=end_h, minute=end_m, second=0, microsecond=0)
            if expiry < now: # If end time is tomorrow
                from datetime import timedelta
                expiry += timedelta(days=1)
            state.scheduled_session_expires = expiry
            state.scheduled_session_active = True
        except Exception as e:
            print(f"Error calculating schedule expiry: {e}")

        event_details = f"Schedule: {sched.name}"
        if sched.type == "soak":
            # Soak: Set heat to target, respect device preferences
            state.heater = True
            if sched.target_temp is not None:
                settings.set_point = sched.target_temp
            state.jet_pump = getattr(sched, 'jet_on', False)
            state.light = getattr(sched, 'light_on', True)
            state.ozone = getattr(sched, 'ozone_on', False)
            event_details += f" (Temp: {sched.target_temp}F, Jets: {'On' if state.jet_pump else 'Off'}, Light: {'On' if state.light else 'Off'}, Ozone: {'On' if state.ozone else 'Off'})"
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

        state.scheduled_session_active = False
        state.scheduled_session_expires = None

        if sched.type == "soak":
            if settings:
                settings.set_point = settings.default_rest_temp
            state.jet_pump = False
            state.light = False
            state.ozone = False
            state.heater = True 
        elif sched.type == "clean":
            state.jet_pump = False
        elif sched.type == "ozone":
            state.ozone = False
            
        log = UsageLog(event=f"{sched.type.capitalize()} Cycle Ended", details=f"Schedule: {sched.name}")
        db.add(log)
        db.commit()

scheduler = HotTubScheduler()