#!/usr/bin/env bash

while true; do
  response=$(curl -s --max-time 3 -o /dev/null -w "%{http_code}" "$1")

  if [ "$response" -eq 200 ] || [ "$response" -eq 301 ]; then
    echo "Request succeeded at $(date)"
  else
    echo "Request failed with HTTP code $response at $(date)"
  fi
  sleep 1
done
