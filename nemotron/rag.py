import os, json
from typing import List, Tuple, Dict
import numpy as np
import faiss

from hf import hf_feature_extraction

DATA_DIR = os.path.join(os.getcwd(), "data")
INDEX_PATH = os.path.join(DATA_DIR, "index.faiss")
META_PATH  = os.path.join(DATA_DIR, "meta.json")

class VectorStore:
    def __init__(self):
        self.index = None
        self.meta: List[Dict] = []
        self.dim = None

    def _ensure_dir(self):
        os.makedirs(DATA_DIR, exist_ok=True)

    def build(self, chunks: List[Dict[str, str]]) -> None:
        """
        chunks: [{"id": "doc_id#0", "text": "..."}]
        """
        self._ensure_dir()
        texts = [c["text"] for c in chunks]
        vecs = hf_feature_extraction(texts)
        X = np.array(vecs).astype("float32")
        self.dim = X.shape[1]
        self.index = faiss.IndexFlatIP(self.dim)
        # Normalize for cosine
        faiss.normalize_L2(X)
        self.index.add(X)
        self.meta = chunks
        self.save()

    def save(self):
        assert self.index is not None and self.dim is not None
        faiss.write_index(self.index, INDEX_PATH)
        with open(META_PATH, "w", encoding="utf-8") as f:
            json.dump({"meta": self.meta, "dim": self.dim}, f, ensure_ascii=False)

    def load(self):
        if not (os.path.exists(INDEX_PATH) and os.path.exists(META_PATH)):
            raise FileNotFoundError("Index or metadata not found. Run /ingest first.")
        self.index = faiss.read_index(INDEX_PATH)
        with open(META_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        self.meta = data["meta"]
        self.dim = data["dim"]

    def search(self, query: str, k: int = 5) -> List[Tuple[float, Dict]]:
        qv = np.array(hf_feature_extraction([query])[0], dtype="float32")[None, :]
        faiss.normalize_L2(qv)
        D, I = self.index.search(qv, k)
        results = []
        for score, idx in zip(D[0].tolist(), I[0].tolist()):
            if idx == -1:  # no hit
                continue
            results.append((float(score), self.meta[idx]))
        return results

def format_prompt(contexts: List[Dict], user_query: str) -> str:
    """
    Format the prompt for RAG-based generation.
    Creates a clear, concise prompt for the NVIDIA API.
    """
    # Format context - keep it concise
    context_text = "\n".join(f"- {c['text'][:400]}" for c in contexts)  # Shorter chunks
    
    # User-friendly system instruction
    system_instruction = (
        "You are a helpful API migration assistant. Explain API schema changes clearly and concisely. "
        "Focus on what changed and what developers need to know. Keep explanations simple and actionable."
    )
    
    # Format prompt
    prompt = f"{system_instruction}\n\nContext:\n{context_text}\n\nUser Question: {user_query}\n\nAssistant Response:"
    
    return prompt
