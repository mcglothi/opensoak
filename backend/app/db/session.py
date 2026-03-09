import logging
import os
import threading
import time
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import sessionmaker
from .models import Base

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./hot_tub.db")
POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "20"))
MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", "40"))
POOL_TIMEOUT = float(os.getenv("DB_POOL_TIMEOUT", "30"))
POOL_WARN_AT = int(os.getenv("DB_POOL_WARN_AT", str(max(5, int((POOL_SIZE + MAX_OVERFLOW) * 0.75)))))
POOL_WARN_INTERVAL = int(os.getenv("DB_POOL_WARN_INTERVAL_SEC", "30"))

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
logger = logging.getLogger("opensoak.db.pool")

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_size=POOL_SIZE,
    max_overflow=MAX_OVERFLOW,
    pool_timeout=POOL_TIMEOUT,
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

_pool_lock = threading.Lock()
_checked_out = 0
_high_watermark = 0
_last_warn_ts = 0.0


def _pool_status():
    return engine.pool.status()


@event.listens_for(engine, "checkout")
def _on_checkout(*_args):
    global _checked_out, _high_watermark, _last_warn_ts
    with _pool_lock:
        _checked_out += 1
        if _checked_out > _high_watermark:
            _high_watermark = _checked_out

        now = time.time()
        if _checked_out >= POOL_WARN_AT and (now - _last_warn_ts) >= POOL_WARN_INTERVAL:
            _last_warn_ts = now
            logger.warning(
                "DB pool pressure: checked_out=%s high_watermark=%s pool_size=%s max_overflow=%s status=%s",
                _checked_out,
                _high_watermark,
                POOL_SIZE,
                MAX_OVERFLOW,
                _pool_status(),
            )


@event.listens_for(engine, "checkin")
def _on_checkin(*_args):
    global _checked_out
    with _pool_lock:
        _checked_out = max(0, _checked_out - 1)


def get_pool_diagnostics():
    with _pool_lock:
        return {
            "checked_out": _checked_out,
            "high_watermark": _high_watermark,
            "pool_size": POOL_SIZE,
            "max_overflow": MAX_OVERFLOW,
            "timeout_sec": POOL_TIMEOUT,
            "warn_at": POOL_WARN_AT,
            "pool_status": _pool_status(),
        }

def init_db():
    logger.info(
        "DB pool initialized: pool_size=%s max_overflow=%s timeout=%ss warn_at=%s",
        POOL_SIZE,
        MAX_OVERFLOW,
        POOL_TIMEOUT,
        POOL_WARN_AT,
    )
    Base.metadata.create_all(bind=engine)
    _apply_schema_updates()


def _apply_schema_updates():
    inspector = inspect(engine)
    schedule_columns = {column["name"] for column in inspector.get_columns("schedules")}

    with engine.begin() as connection:
        if "pause_until" not in schedule_columns:
            connection.execute(text("ALTER TABLE schedules ADD COLUMN pause_until DATETIME"))
        if "disable_during_vacations" not in schedule_columns:
            connection.execute(text("ALTER TABLE schedules ADD COLUMN disable_during_vacations BOOLEAN DEFAULT 0"))
