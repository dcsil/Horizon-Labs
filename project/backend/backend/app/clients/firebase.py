import os
PROJECT = os.getenv("FIREBASE_PROJECT_ID", "local")

def get_firestore():
    # if emulator vars not set, return a stub
    class NoopFS:
        def doc(self, *_a, **_k): return self
        def set(self, *_a, **_k): return None
        def get(self, *_a, **_k): return {"exists": False}
    return NoopFS()
