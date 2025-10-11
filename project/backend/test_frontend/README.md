# Test Frontend

A minimal static client to exercise the Horizon Labs chat backend. The page streams responses from `/chat/stream`, maintaining conversational state via the `session_id` field.

## Usage

1. Ensure the backend is running and accessible (for example `uvicorn app.main:app --reload --port 8000`).
2. From this directory, serve the static files. Any simple server works, e.g.

   ```bash
   python3 -m http.server 3001
   ```

3. Visit <http://localhost:3001/index.html>. Update the backend URL if needed.
4. Fill in the form and click **Send Message**. The right-hand pane streams tokens as they arrive.
5. Reuse the same session id to keep the conversation history in memory. Click **Reset Session** to clear the in-memory history for the current session id and wipe the streaming output without restarting the backend.

### Adaptive Friction Playground

- Visit <http://localhost:3001/friction.html> to exercise the adaptive friction gate.
- The page shows the server-side mode (friction vs. guidance), the number of qualifying learner responses recorded for the active session, and how many more are needed to unlock guidance.
- Use **Refresh State** at any time to query `/debug/friction-state` and confirm the backend counters. Send learner inputs of varying lengths to validate the ≥15-word threshold and guidance reset behaviour.

> The static client accepts optional context and metadata fields. Metadata must be valid JSON.
