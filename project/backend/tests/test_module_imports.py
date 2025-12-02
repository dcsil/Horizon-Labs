from __future__ import annotations

"""Ensures all backend modules import cleanly for packaging and typing checks."""

import importlib
import pkgutil

import pytest


def _import_all_modules(package_name: str) -> list[tuple[str, Exception]]:
    package = importlib.import_module(package_name)
    failures: list[tuple[str, Exception]] = []
    for module in pkgutil.walk_packages(package.__path__, prefix=f"{package.__name__}."):
        # Skip dunder/virtual modules
        name = module.name
        if name.endswith(".__main__"):
            continue
        try:
            importlib.import_module(name)
        except Exception as exc:  # pragma: no cover - captured for assertions
            failures.append((name, exc))
    return failures


@pytest.mark.parametrize("package_name", ["app", "clients"])
def test_all_backend_modules_can_import(package_name: str):
    failures = _import_all_modules(package_name)
    if failures:
        details = "\n".join(f"{name}: {exc}" for name, exc in failures)
        pytest.fail(f"Failed to import modules for package '{package_name}':\n{details}")
