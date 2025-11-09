from typing import List, Dict
import numpy as np
import os, glob

def load_text_files(folder: str) -> List[Dict]:
    paths = sorted(glob.glob(os.path.join(folder, "**", "*.*"), recursive=True))
    texts = []
    for p in paths:
        ext = os.path.splitext(p)[1].lower()
        if ext in [".txt", ".md"]:
            with open(p, "r", encoding="utf-8", errors="ignore") as f:
                texts.append({"id": os.path.relpath(p, folder), "text": f.read()})
        # Add PDF later with pypdf
    return texts

def simple_chunk(text: str, chunk_size: int = 900, overlap: int = 150) -> List[str]:
    """
    Token-agnostic chunker: splits by characters.
    Good enough for a demo; swap with token-aware later if needed.
    """
    if not text:
        return []
    chunks = []
    i = 0
    while i < len(text):
        chunk = text[i:i+chunk_size]
        chunks.append(chunk.strip())
        i += chunk_size - overlap
        if i <= 0: break
    return [c for c in chunks if c]

def cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    denom = (np.linalg.norm(a) * np.linalg.norm(b)) + 1e-8
    return float(np.dot(a, b) / denom)
