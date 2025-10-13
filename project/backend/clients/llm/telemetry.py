from __future__ import annotations

import json
import logging
import random
from dataclasses import asdict, dataclass
from typing import Optional

from .settings import Settings

logger = logging.getLogger("telemetry")


@dataclass
class TelemetryEvent:
    session_id: str
    service: str
    latency_ms: float
    input_tokens: int
    output_tokens: int
    total_tokens: int
    total_cost: Optional[float]
    guidance_used: Optional[bool] = None
    friction_attempts: Optional[int] = None
    friction_threshold: Optional[int] = None
    turn_classification: Optional[str] = None
    classification_source: Optional[str] = None


class TelemetryLogger:
    """Basic structured logger for model usage metrics."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def record(self, event: TelemetryEvent) -> None:
        if not self._settings.telemetry_enabled:
            return
        if random.random() > self._settings.telemetry_sample_rate:
            return
        payload = {"event": "llm_usage", **asdict(event)}
        logger.info(json.dumps(payload, ensure_ascii=False))
