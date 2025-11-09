# Testing the /ingest Endpoint with curl

## Basic curl command to test the ingest endpoint:

```bash
curl -X POST "http://localhost:8000/ingest" \
  -F "files=@/path/to/your/file.txt"
```

## Example with a sample diff report:

```bash
# Create a test file first
cat > test_diff.txt << 'EOF'
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
3. TYPE CHANGED: Field "user.age" changed from number to string.
EOF

# Then send it to the endpoint
curl -X POST "http://localhost:8000/ingest" \
  -F "files=@test_diff.txt"
```

## With verbose output (to see request/response details):

```bash
curl -X POST "http://localhost:8000/ingest" \
  -F "files=@test_diff.txt" \
  -v
```

## Expected response:

```json
{
  "ok": true,
  "chunks": 1
}
```

## Testing with multiple files:

```bash
curl -X POST "http://localhost:8000/ingest" \
  -F "files=@file1.txt" \
  -F "files=@file2.txt"
```

## Testing with folder (alternative method):

```bash
curl -X POST "http://localhost:8000/ingest" \
  -F "folder=data/docs"
```

## Troubleshooting:

1. **Make sure the server is running:**
   ```bash
   cd nemotron
   python main.py
   ```

2. **Check if the server is accessible:**
   ```bash
   curl http://localhost:8000/docs
   ```

3. **Check server logs for errors**

4. **Verify file exists and is readable:**
   ```bash
   ls -la /path/to/your/file.txt
   cat /path/to/your/file.txt
   ```

