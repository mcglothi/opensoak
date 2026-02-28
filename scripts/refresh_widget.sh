#!/bin/bash
SHIELD_IP="10.10.174.255"
echo "Starting widget refresher for $SHIELD_IP..."

while true; do
    # Try to connect if not connected
    if ! adb devices | grep -q "$SHIELD_IP"; then
        adb connect $SHIELD_IP:5555
        sleep 2
    fi
    
    # Broadcast refresh intent
    adb -s $SHIELD_IP:5555 shell am broadcast -a com.opensoak.app.action.REFRESH -n com.opensoak.app/.OpenSoakWidget > /dev/null 2>&1
    
    # Wait 60 seconds
    sleep 60
done
