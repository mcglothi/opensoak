import sqlite3
from datetime import datetime, timedelta
import random

db_path = "/opt/opensoak/backend/hot_tub.db"
conn = sqlite3.connect(db_path)
curr = conn.cursor()

# Clear existing sample data if any (optional, but good for clean baseline)
# curr.execute("DELETE FROM heating_events")
# curr.execute("DELETE FROM energy_logs")

# 1. Backfill HeatingEvents (Histogram)
print("Backfilling Heating Events...")
now = datetime.now()
for i in range(15):
    t = now - timedelta(hours=i*4)
    event_type = "heat" if random.random() > 0.7 else "cool"
    
    if event_type == "heat":
        start_temp = 104.0
        target_temp = 106.0
        rate = 4.0 + random.uniform(-0.5, 0.5)
        duration = (target_temp - start_temp) / rate * 3600
    else:
        start_temp = 106.0
        target_temp = 105.0
        rate = -1.2 - random.uniform(0, 0.4)
        duration = (start_temp - target_temp) / abs(rate) * 3600
        
    curr.execute("""
        INSERT INTO heating_events (timestamp, event_type, start_temp, target_temp, duration_seconds, outside_temp, efficiency_score)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (t.isoformat(), event_type, start_temp, target_temp, duration, 35.0 + random.uniform(-10, 10), rate))

# 2. Backfill Energy Logs
print("Backfilling Energy Logs...")
kwh_cost = 0.12721
wattages = {
    "heater": 6000.0,
    "circ_pump": 115.0,
    "jet_pump": 1200.0,
    "light": 5.0,
    "ozone": 6.0
}

# Generate 15 days of data
for d in range(15):
    # Shift time to mid-day for the log entry
    day_date = now - timedelta(days=d)
    
    # Runtimes in seconds
    runtimes = {
        "circ_pump": 86400, # Always on
        "heater": 7200 + random.randint(-1800, 3600), # ~2 hours avg
        "jet_pump": 900, # 15 min clean cycle
        "light": 18000, # 5 hour soak
        "ozone": 900 # 15 min clean
    }
    
    for component, seconds in runtimes.items():
        kwh = (wattages[component] * (seconds / 3600)) / 1000
        cost = kwh * kwh_cost
        curr.execute("""
            INSERT INTO energy_logs (timestamp, component, runtime_seconds, kwh_used, estimated_cost)
            VALUES (?, ?, ?, ?, ?)
        """, (day_date.isoformat(), component, seconds, kwh, cost))

conn.commit()
conn.close()
print("Backfill Complete!")
