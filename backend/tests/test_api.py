import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db.session import SessionLocal, engine
from app.db.models import Base

@pytest.fixture(scope="module")
def anyio_backend():
    return "asyncio"

@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

@pytest.mark.anyio
async def test_read_root():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "OpenSoak API is running"}

@pytest.mark.anyio
async def test_get_status():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/api/status/")
    assert response.status_code == 200
    data = response.json()
    assert "current_temp" in data
    assert "safety_status" in data