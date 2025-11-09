#!/bin/bash

# Test script for the /ingest endpoint
# Make sure the FastAPI server is running on http://localhost:8000

echo "Testing /ingest endpoint with a sample diff report..."

# Create a temporary test file
TEST_FILE=$(mktemp)
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

echo "Created test file: $TEST_FILE"
echo ""
echo "Sending POST request to http://localhost:8000/ingest..."
echo ""

# Test with file upload
curl -X POST "http://localhost:8000/ingest" \
  -F "files=@$TEST_FILE" \
  -v

echo ""
echo ""
echo "Test completed. Cleaning up..."
rm "$TEST_FILE"

