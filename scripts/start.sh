#!/bin/bash
# Start OpenSoak in development mode

trap "kill 0" EXIT

echo "Starting Backend API..."
cd backend
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 &
cd ..

echo "Starting Frontend Dev Server..."
cd frontend
npm run dev -- --host 0.0.0.0 &
cd ..

wait
