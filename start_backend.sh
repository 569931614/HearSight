#!/bin/bash
cd /www/wwwroot/HearSight

# Load environment variables from .env file
# Strip inline comments before exporting
export $(grep -v '^#' .env | grep -v '^$' | sed 's/#.*$//' | sed 's/[[:space:]]*$//' | xargs)

# Start backend
exec /usr/bin/python3.8 -m uvicorn main:app --host 0.0.0.0 --port 9999
