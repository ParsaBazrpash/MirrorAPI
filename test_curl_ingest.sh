#!/bin/bash
# Test curl command for ingest - run from HACKUTD-25 directory

echo "Testing /ingest endpoint..."
echo ""

# Test with correct file path
curl -X POST "http://localhost:8000/ingest" \
  -F "files=@nemotron/test_diff_report.txt" \
  -v

echo ""
echo "Done!"
