#!/bin/bash
# Setup script for OpenSoak

echo "Setting up Backend..."
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd ..

echo "Setting up Frontend..."
cd frontend
npm install
npm run build
cd ..

echo "Setup Complete!"
