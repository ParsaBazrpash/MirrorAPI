#!/bin/bash

# Fixed test script for the /ingest endpoint
# This script should be run from the HACKUTD-25 directory

echo "=== Testing /ingest endpoint ==="
echo ""

# Check if we're in the right directory
if [ ! -d "nemotron" ]; then
    echo "Error: nemotron directory not found. Please run this from the HACKUTD-25 directory."
    exit 1
fi

# Path to test file
TEST_FILE="nemotron/test_diff_report.txt"

# Check if file exists
if [ ! -f "$TEST_FILE" ]; then
    echo "Error: Test file not found at $TEST_FILE"
    echo "Creating test file..."
    cat > "$TEST_FILE" << 'EOF'
API Schema Migration Changes Report
=====================================

Summary:
- Added Fields: 2
- Removed Fields: 1
- Risky Changes: 3

Detailed Changes:
================

1. REMOVED: Field "user.email" (type: string) was removed from the API.

2. ADDED: Field "user.contact.email" (type: string) was added to the API.

3. ADDED: Field "user.contact.phone" (type: string) was added to the API.

4. TYPE CHANGED: Field "user.age" changed from number to string.
EOF
    echo "Test file created at $TEST_FILE"
fi

echo "Sending POST request to http://localhost:8000/ingest..."
echo "Using file: $TEST_FILE"
echo ""

# Test with file upload (correct path)
curl -X POST "http://localhost:8000/ingest" \
  -F "files=@$TEST_FILE" \
  -v

echo ""
echo ""
echo "=== Test completed ==="
echo ""
echo "If successful, you should see: {\"ok\": true, \"chunks\": 1}"
echo ""
echo "Next, test the chat endpoint with:"
echo "curl -X POST \"http://localhost:8000/chat\" \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -d '{\"query\": \"Explain the API changes\", \"max_new_tokens\": 256}'"

