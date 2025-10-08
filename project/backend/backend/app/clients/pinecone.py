import os
KEY = os.getenv("PINECONE_API_KEY")

class NoopIndex:
    def query(self, *_a, **_k): return {"matches": []}

def get_index():
    if not KEY:
        return NoopIndex()
    # return real pinecone index later
    return NoopIndex()
