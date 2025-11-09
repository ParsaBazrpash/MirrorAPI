# Quick Test Guide

## Issues Fixed:

1. **File Path**: Curl command now uses correct path `nemotron/test_diff_report.txt`
2. **HuggingFace Token**: Only includes Authorization header if token is set
3. **Better Model**: Changed to `mistralai/Mistral-7B-Instruct-v0.1` for better instruction following
4. **Prompt Formatting**: Fixed system message to be clearer
5. **Error Handling**: Better handling of 503 errors (model loading)
6. **Fallback Generation**: Improved fallback when HF API fails

## Quick Test Commands:

### 1. Start the server:
```bash
cd nemotron
python main.py
```

### 2. Test ingest (from HACKUTD-25 directory):
```bash
# Option 1: Use the test script
./nemotron/test_ingest_fixed.sh

# Option 2: Manual curl command
curl -X POST "http://localhost:8000/ingest" \
  -F "files=@nemotron/test_diff_report.txt" \
  -v
```

### 3. Test chat:
```bash
curl -X POST "http://localhost:8000/chat" \
  -H "Content-Type: application/json" \
  -d '{"query": "Explain the API changes", "max_new_tokens": 300}'
```

## Expected Results:

### Ingest Response:
```json
{
  "ok": true,
  "chunks": 1
}
```

### Chat Response:
```json
{
  "ok": true,
  "answer": "Based on the API schema changes...",
  "contexts": [...],
  "scores": [0.7...]
}
```

## Troubleshooting:

1. **If ingest fails with file error**: Make sure you're running curl from the HACKUTD-25 directory, not nemotron directory
2. **If HuggingFace API fails**: 
   - Check if HF_TOKEN is set in .env file
   - The system will fallback to simple generation (works but less accurate)
   - Check server logs for error messages
3. **If model is loading (503)**: The system will automatically wait and retry

## Environment Variables:

Create a `.env` file in the project root with:
```
HF_TOKEN=your_huggingface_token_here
```

Get your token from: https://huggingface.co/settings/tokens

