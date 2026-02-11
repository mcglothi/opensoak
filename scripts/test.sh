#!/bin/bash
# Run all OpenSoak tests

echo "Running Backend Tests..."
cd backend
source venv/bin/activate
export PYTHONPATH=$PYTHONPATH:.
pytest tests/
cd ..

echo "Running Frontend Tests..."
cd frontend
npm test
cd ..

echo "Testing Complete!"
