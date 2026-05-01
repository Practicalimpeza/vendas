from __future__ import annotations

from nexovarejo import __version__

try:
    from fastapi import FastAPI
except ImportError:  # pragma: no cover - depende do ambiente de API
    FastAPI = None


def create_app():
    if FastAPI is None:
        raise RuntimeError("Instale as dependencias de API com: pip install -r requirements.txt")

    app = FastAPI(title="NexoVarejo API", version=__version__)

    @app.get("/health")
    def health():
        return {"ok": True, "service": "nexovarejo", "version": __version__}

    return app


if FastAPI is not None:
    app = create_app()
