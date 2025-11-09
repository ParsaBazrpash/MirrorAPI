import os, json, requests
from typing import List
import numpy as np
import hashlib

# NVIDIA API Configuration
NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "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")
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
NVIDIA_MODEL = "nvidia/nvidia-nemotron-nano-9b-v2"

# HuggingFace for embeddings (keep existing)
HF_TOKEN = os.getenv("HF_TOKEN", "")
EMBED_MODEL = os.getenv("EMBED_MODEL", "sentence-transformers/all-MiniLM-L6-v2")

HEADERS_JSON = {
    "Content-Type": "application/json",
}
if HF_TOKEN:
    HEADERS_JSON["Authorization"] = f"Bearer {HF_TOKEN}"

def simple_text_embedding(text: str, dim: int = 384) -> List[float]:
    """
    Simple fallback embedding using text hashing and basic NLP features.
    This is a backup when HuggingFace API is unavailable.
    """
    text_lower = text.lower().strip()
    features = []
    
    char_hash = int(hashlib.md5(text_lower.encode()).hexdigest()[:8], 16) % (2**31)
    features.extend([
        char_hash / (2**31),
        len(text) / 1000.0,
        text.count(' ') / len(text) if len(text) > 0 else 0,
    ])
    
    words = text_lower.split()
    if words:
        avg_word_len = sum(len(w) for w in words) / len(words)
        features.append(avg_word_len / 20.0)
    else:
        features.append(0.0)
    
    while len(features) < dim:
        seed = len(features)
        hash_val = int(hashlib.md5(f"{text_lower}_{seed}".encode()).hexdigest()[:8], 16)
        features.append((hash_val % 1000) / 1000.0)
    
    return features[:dim]

def hf_feature_extraction(texts: List[str]) -> List[List[float]]:
    """
    Gets embeddings - tries local sentence-transformers first, then API, then fallback.
    """
    # Try local sentence-transformers (best option)
    try:
        from sentence_transformers import SentenceTransformer
        if not hasattr(hf_feature_extraction, '_local_model'):
            print(f"✅ Using local embedding model: {EMBED_MODEL}")
            hf_feature_extraction._local_model = SentenceTransformer(EMBED_MODEL)
        embeddings = hf_feature_extraction._local_model.encode(texts, convert_to_numpy=True, show_progress_bar=False)
        return embeddings.tolist()
    except ImportError:
        pass  # sentence-transformers not installed
    except Exception as e:
        print(f"Local model failed: {e}")
    
    # Try HuggingFace API
    try:
        url = f"https://api-inference.huggingface.co/models/{EMBED_MODEL}"
        payload = {"inputs": texts}
        r = requests.post(url, headers=HEADERS_JSON, data=json.dumps(payload), timeout=30)
        if r.status_code == 200:
            out = r.json()
            if isinstance(out, list) and isinstance(out[0], list):
                return out
            if isinstance(out[0], dict) and "embedding" in out[0]:
                return [row["embedding"] for row in out]
    except Exception:
        pass
    
    # Fallback
    print("⚠️  Using simple fallback embeddings")
    return [simple_text_embedding(text) for text in texts]

def hf_generate(prompt: str, max_new_tokens: int = 512, temperature: float = 0.3) -> str:
    """
    Uses NVIDIA API for text generation with user-friendly, concise explanations.
    """
    try:
        from openai import OpenAI
        
        client = OpenAI(
            base_url=NVIDIA_BASE_URL,
            api_key=NVIDIA_API_KEY
        )
        
        # Extract context and query from prompt for better formatting
        lines = prompt.split('\n')
        context_text = ""
        user_query = ""
        in_context = False
        
        for line in lines:
            if line.strip().startswith("Context:"):
                in_context = True
                continue
            elif line.strip().startswith("User Question:") or line.strip().startswith("User:"):
                in_context = False
                user_query = line.split(":", 1)[-1].strip() if ":" in line else line.strip()
            elif in_context and line.strip().startswith("-"):
                context_text += line.strip()[1:].strip() + "\n"
        
        # Create a concise, user-friendly system prompt
        system_prompt = (
            "You are an API migration assistant. Explain API schema changes in simple, clear terms. "
            "Focus on:\n"
            "- What fields changed (name them)\n"
            "- What the impact is (breaking vs safe)\n"
            "- What developers need to do\n"
            "Keep it short (2-3 sentences per change). Use plain language, avoid technical jargon."
        )
        
        # Build user message with context
        user_message = f"API Changes Summary:\n{context_text}\n\nQuestion: {user_query or 'Explain these API changes in simple terms'}"
        
        # Call NVIDIA API
        completion = client.chat.completions.create(
            model=NVIDIA_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ],
            temperature=temperature,
            max_tokens=min(max_new_tokens, 500),  # Limit for concise responses
            top_p=0.9,
        )
        
        response = completion.choices[0].message.content
        print("✅ Using NVIDIA API for generation")
        return response.strip()
        
    except ImportError:
        print("⚠️  openai package not installed. Install with: pip install openai")
        print("Falling back to simple generation...")
        return simple_text_generation(prompt, max_new_tokens)
    except Exception as e:
        print(f"⚠️  NVIDIA API failed: {e}")
        print("Falling back to simple generation...")
        return simple_text_generation(prompt, max_new_tokens)

def simple_text_generation(prompt: str, max_new_tokens: int = 512) -> str:
    """
    Improved fallback that extracts and formats API changes clearly.
    """
    lines = prompt.split('\n')
    context_lines = []
    in_context = False
    
    for line in lines:
        if line.strip().startswith("Context:"):
            in_context = True
            continue
        elif line.strip().startswith("User Question:"):
            in_context = False
        elif in_context and line.strip().startswith("-"):
            context_lines.append(line.strip()[1:].strip())
    
    if context_lines:
        # Extract changes
        changes = []
        for ctx in context_lines:
            if "REMOVED" in ctx or "removed" in ctx:
                # Extract field name
                if '"' in ctx:
                    field = ctx.split('"')[1] if '"' in ctx else "field"
                    changes.append(f"• Removed: {field} - This field no longer exists. Update your code to stop using it.")
            elif "ADDED" in ctx or "added" in ctx:
                if '"' in ctx:
                    field = ctx.split('"')[1] if '"' in ctx else "field"
                    changes.append(f"• Added: {field} - New field available. Optional to use.")
            elif "TYPE CHANGED" in ctx or "changed from" in ctx:
                if '"' in ctx:
                    field = ctx.split('"')[1] if '"' in ctx else "field"
                    old_type = ctx.split("from")[1].split("to")[0].strip() if "from" in ctx else "old type"
                    new_type = ctx.split("to")[1].strip().split(".")[0] if "to" in ctx else "new type"
                    changes.append(f"• Changed: {field} - Type changed from {old_type} to {new_type}. Update your code to handle the new type.")
        
        if changes:
            response = "API Changes Summary:\n\n" + "\n\n".join(changes[:5])
            response += "\n\n💡 Tip: Test your integration after updating to the new API version."
            return response[:max_new_tokens]
        
        # Fallback format
        return f"API Schema Changes Detected:\n\n" + "\n".join(f"• {ctx[:100]}" for ctx in context_lines[:5])[:max_new_tokens]
    
    return "No API changes detected in the provided context."