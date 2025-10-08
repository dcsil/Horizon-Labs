import os
KEY = os.getenv("OPENROUTER_API_KEY")

class NoopOpenRouter:
    async def chat(self, *_a, **_k):
        return {"message": "noop"}

def get_client():
    if not KEY:
        return NoopOpenRouter()
    # return real client here later
    return NoopOpenRouter()
