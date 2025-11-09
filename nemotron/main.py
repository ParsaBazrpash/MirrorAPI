import os
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from openai import OpenAI
from utils import load_text_files, simple_chunk
from rag import VectorStore, format_prompt
from hf import hf_generate

load_dotenv()

TOP_K = int(os.getenv("TOP_K", "5"))
MAX_NEW = int(os.getenv("MAX_NEW_TOKENS", "512"))
TEMP   = float(os.getenv("TEMPERATURE", "0.3"))

nemotron = FastAPI(title="Nemotron RAG (Python)")

# Add CORS middleware to allow requests from frontend
nemotron.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins like ["http://localhost:3000"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

VS = VectorStore()

class ChatIn(BaseModel):
    query: str
    top_k: int | None = None
    max_new_tokens: int | None = None
    temperature: float | None = None

class GenerateIn(BaseModel):
    query: str | None = None
    changes: list[dict] | None = None  # List of change objects with path, kind, oldType, newType
    old_schema: dict | None = None  # Old API schema (v1)
    new_schema: dict | None = None  # New API schema (v2)
    top_k: int | None = None
    max_new_tokens: int | None = None
    temperature: float | None = None

@nemotron.post("/ingest")
async def ingest(
    # Option A: ingest whole folder (default: data/docs)
    folder: str = Form(default="data/docs"),
    # Option B: OR upload ad-hoc text files
    files: list[UploadFile] | None = File(default=None)
):
    chunks = []
    if files:
        # Push uploaded files into memory and chunk
        for f in files:
            text = (await f.read()).decode("utf-8", errors="ignore")
            for i, ch in enumerate(simple_chunk(text)):
                chunks.append({"id": f.filename + f"#{i}", "text": ch})
    else:
        docs = load_text_files(folder)
        for d in docs:
            for i, ch in enumerate(simple_chunk(d["text"])):
                chunks.append({"id": d["id"] + f"#{i}", "text": ch})

    if not chunks:
        return {"ok": False, "msg": "No text found to ingest."}

    VS.build(chunks)
    return {"ok": True, "chunks": len(chunks)}

@nemotron.post("/chat")
async def chat(payload: ChatIn):
    # lazy-load index if needed
    try:
        if VS.index is None:
            VS.load()
    except FileNotFoundError:
        return {"ok": False, "msg": "Index not found. Run /ingest first."}

    k = payload.top_k or TOP_K
    hits = VS.search(payload.query, k=k)
    contexts = [m for _, m in hits]
    prompt = format_prompt(contexts, payload.query)

    out = hf_generate(
        prompt,
        max_new_tokens=payload.max_new_tokens or MAX_NEW,
        temperature=payload.temperature or TEMP,
    )

    return {
        "ok": True,
        "answer": out.strip(),
        "contexts": contexts,          # you can show these in the UI as citations
        "scores": [s for s, _ in hits] # similarity scores (0..1 after L2 norm/IP)
    }

def extract_value_by_path(obj: dict, path: str):
    """
    Extract a value from a nested dictionary using a dot-separated path.
    Example: extract_value_by_path({"user": {"name": "John"}}, "user.name") -> "John"
    """
    try:
        keys = path.split(".")
        current = obj
        for key in keys:
            # Handle array indices like "items[0]"
            if "[" in key and "]" in key:
                key_part = key[:key.index("[")]
                idx_part = key[key.index("[")+1:key.index("]")]
                if key_part:
                    current = current[key_part]
                current = current[int(idx_part)]
            else:
                if isinstance(current, dict):
                    current = current.get(key)
                else:
                    return None
            if current is None:
                return None
        return current
    except (KeyError, IndexError, TypeError, AttributeError):
        return None

@nemotron.post("/generate")
async def generate(payload: GenerateIn):
    """
    Generate insights on why API v1 was changed to v2 using fields and values.
    Accepts changes content with old/new schemas and generates reasoning insights.
    """
    try:
        import json
        
        # Get NVIDIA API key from environment
        nvidia_api_key = os.getenv("NVIDIA_API_KEY", "x")
        
        client = OpenAI(
            base_url="https://integrate.api.nvidia.com/v1",
            api_key=nvidia_api_key
        )
        
        # Use available Nemotron models
        model = os.getenv("NVIDIA_MODEL", "nvidia/llama-3.1-nemotron-nano-8b-v1")
        
        # Get parameters from payload or use defaults
        temperature = payload.temperature or TEMP
        max_tokens = payload.max_new_tokens or MAX_NEW
        
        # Build the context with changes, old schema, and new schema
        context_parts = []
        
        if payload.changes:
            context_parts.append("=== API CHANGES DETECTED ===\n")
            for i, change in enumerate(payload.changes[:10], 1):  # Limit to top 10 changes
                change_path = change.get("path", "unknown")
                change_kind = change.get("kind", "UNKNOWN")
                
                if change_kind == "REMOVED_FIELD":
                    old_type = change.get("oldType", "unknown")
                    context_parts.append(f"{i}. REMOVED: Field '{change_path}' (was {old_type})")
                elif change_kind == "ADDED_FIELD":
                    new_type = change.get("newType", "unknown")
                    context_parts.append(f"{i}. ADDED: Field '{change_path}' (now {new_type})")
                elif change_kind == "TYPE_CHANGED":
                    old_type = change.get("oldType", "unknown")
                    new_type = change.get("newType", "unknown")
                    context_parts.append(f"{i}. TYPE CHANGED: Field '{change_path}' changed from {old_type} to {new_type}")
        
        # Add old schema values for changed fields
        if payload.old_schema and payload.changes:
            context_parts.append("\n=== OLD API (v1) VALUES ===\n")
            for change in payload.changes[:10]:
                path = change.get("path", "")
                if path:
                    # Extract value from old schema using path
                    value = extract_value_by_path(payload.old_schema, path)
                    if value is not None:
                        # Format value nicely (limit length)
                        value_str = json.dumps(value) if not isinstance(value, (str, int, float, bool)) else str(value)
                        if len(value_str) > 100:
                            value_str = value_str[:100] + "..."
                        context_parts.append(f"  {path}: {value_str}")
        
        # Add new schema values for changed fields
        if payload.new_schema and payload.changes:
            context_parts.append("\n=== NEW API (v2) VALUES ===\n")
            for change in payload.changes[:10]:
                path = change.get("path", "")
                if path and change.get("kind") != "REMOVED_FIELD":
                    # Extract value from new schema using path
                    value = extract_value_by_path(payload.new_schema, path)
                    if value is not None:
                        # Format value nicely (limit length)
                        value_str = json.dumps(value) if not isinstance(value, (str, int, float, bool)) else str(value)
                        if len(value_str) > 100:
                            value_str = value_str[:100] + "..."
                        context_parts.append(f"  {path}: {value_str}")
        
        # Build the user message
        changes_context = "\n".join(context_parts) if context_parts else "No changes provided."
        
        user_query = payload.query or (
            "Analyze these API changes and explain WHY the API was changed from v1 to v2. "
            "Focus on the business logic, data modeling improvements, or technical reasons behind each change. "
            "Use the field names, types, and actual values to provide insights. "
            "Explain what problems the changes might solve or what improvements they bring."
        )
        
        user_message = f"""API Schema Migration Analysis Request:

{changes_context}

Question: {user_query}

Please provide insights on why these changes were made, focusing on:
1. What problems or limitations in v1 these changes address
2. What improvements or benefits v2 provides
3. The likely reasoning behind specific field changes based on their values and types
4. Any patterns or trends in the changes that suggest architectural improvements
"""
        
        # Create system prompt focused on reasoning and insights
        system_prompt = (
            "You are an API migration analyst with deep expertise in API design and evolution. "
            "Your task is to analyze API schema changes and provide insights on WHY changes were made, "
            "not just WHAT changed. Consider:\n"
            "- Data modeling improvements (better structure, normalization, denormalization)\n"
            "- Business logic changes (new requirements, feature additions)\n"
            "- Technical improvements (performance, scalability, maintainability)\n"
            "- Backward compatibility concerns\n"
            "- Industry best practices and patterns\n\n"
            "Use the actual field names, types, and values to infer the reasoning behind changes. "
            "Be specific and provide actionable insights. Keep explanations clear and concise."
        )
        
        # Create completion with streaming
        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ],
            temperature=temperature,
            top_p=0.95,
            max_tokens=min(max_tokens, 800),  # Allow more tokens for detailed insights
            frequency_penalty=0,
            presence_penalty=0,
            stream=True,
        )
        
        # Collect all chunks from the stream
        full_response = ""
        reasoning_content = ""
        
        for chunk in completion:
            if chunk.choices and len(chunk.choices) > 0:
                delta = chunk.choices[0].delta
                
                # Collect reasoning content if available
                reasoning = getattr(delta, "reasoning_content", None)
                if reasoning:
                    reasoning_content += reasoning
                
                # Collect actual content
                if delta.content is not None:
                    full_response += delta.content
        
        # Return response
        return {
            "ok": True,
            "answer": full_response.strip() if full_response else "No response generated.",
            "reasoning": reasoning_content.strip() if reasoning_content else None,
            "model": model,
        }
        
    except Exception as e:
        error_msg = str(e)
        import traceback
        print(f"⚠️  /generate endpoint error: {error_msg}")
        print(traceback.format_exc())
        
        # Return error in compatible format
        return {
            "ok": False,
            "msg": f"Generation failed: {error_msg}",
        }
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(nemotron, host="0.0.0.0", port=8000)
    
    

