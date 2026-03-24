#!/bin/bash
cd ~/Downloads/lead-tracker/server && node index.js &
cd ~/Downloads/lead-tracker/server && node agent.js &
cd ~/Downloads/lead-tracker/client && npm run dev &
