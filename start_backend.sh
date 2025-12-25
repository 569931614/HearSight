#!/bin/bash
cd /www/wwwroot/HearSight

# Load environment variables from .env file
export $(grep -v '^#' .env | grep -v '^$' | xargs)

# Start backend
exec /usr/bin/python3.8 -m uvicorn main:app --host 0.0.0.0 --port 9999
