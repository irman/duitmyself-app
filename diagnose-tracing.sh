#!/bin/bash

echo "=== SigNoz Tracing Diagnostics ==="
echo ""

echo "1. Checking Environment Variables:"
echo "-----------------------------------"
env | grep OTEL
echo ""

echo "2. Checking Network Connectivity:"
echo "-----------------------------------"
echo "Testing connection to otel-collector..."
if command -v curl &> /dev/null; then
    curl -v http://otel-collector:4318/v1/traces 2>&1 | head -20
elif command -v wget &> /dev/null; then
    wget -O- http://otel-collector:4318/v1/traces 2>&1 | head -20
else
    echo "Neither curl nor wget available, trying ping..."
    ping -c 3 otel-collector
fi
echo ""

echo "3. Checking Docker Networks:"
echo "-----------------------------------"
echo "Container networks:"
cat /etc/hosts | grep -E "(otel|signoz)"
echo ""

echo "4. Testing DNS Resolution:"
echo "-----------------------------------"
nslookup otel-collector 2>&1 || echo "nslookup not available"
echo ""

echo "5. Node.js/Bun Process Info:"
echo "-----------------------------------"
ps aux | grep -E "(bun|node)"
echo ""

echo "=== End Diagnostics ==="
