from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import httpx
import os
from sqlalchemy.orm import Session
from ..db.session import SessionLocal
from ..db.models import Settings

router = APIRouter()

class BugReport(BaseModel):
    title: str
    description: str

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/report-bug")
async def report_bug(report: BugReport, db: Session = Depends(get_db)):
    # 1. Get Token from ENV
    github_token = os.getenv("GITHUB_TOKEN")
    repo = os.getenv("GITHUB_REPO", "mcglothi/opensoak")
    
    if not github_token:
        raise HTTPException(status_code=500, detail="GitHub integration not configured (Missing GITHUB_TOKEN)")

    # 2. Create GitHub Issue
    url = f"https://api.github.com/repos/{repo}/issues"
    headers = {
        "Authorization": f"token {github_token}",
        "Accept": "application/vnd.github.v3+json"
    }
    
    payload = {
        "title": f"[UI Report] {report.title}",
        "body": f"""### Bug Report from OpenSoak Dashboard

**Description:**
{report.description}

---
*Submitted via internal Support API*""",
        "labels": ["bug", "user-reported", "ai-fix"]
    }

    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(url, headers=headers, json=payload)
            if res.status_code != 201:
                raise HTTPException(status_code=res.status_code, detail=f"GitHub API Error: {res.text}")
            
            data = res.json()
            return {"status": "success", "issue_url": data.get("html_url")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
