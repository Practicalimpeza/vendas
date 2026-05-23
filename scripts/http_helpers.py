from __future__ import annotations

import ipaddress
import json
import mimetypes
import os
import re
from pathlib import Path
from typing import Any

from db_helpers import scalar_text


def truthy_env(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in {"1", "true", "sim", "yes", "on"}


def is_loopback_host(host: str) -> bool:
    clean = (host or "").strip().strip("[]")
    if clean.lower() == "localhost":
        return True
    try:
        return ipaddress.ip_address(clean).is_loopback
    except ValueError:
        return False


def send_json(handler: Any, payload: object, status: int = 200, headers: dict[str, str] | None = None) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    for name, value in (headers or {}).items():
        handler.send_header(name, value)
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def send_text(handler: Any, payload: str, status: int = 200) -> None:
    body = str(payload or "").encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "text/plain; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def send_api_error(handler: Any, message: str, status: int = 400, code: str = "bad_request", route: str = "") -> None:
    payload = {"ok": False, "error": message, "code": code, "status": status}
    if route:
        payload["route"] = route
    send_json(handler, payload, status=status)


def read_raw_body(handler: Any) -> bytes:
    length = int(handler.headers.get("Content-Length") or "0")
    if length <= 0:
        return b""
    return handler.rfile.read(length)


def read_json(handler: Any) -> dict:
    body = read_raw_body(handler).decode("utf-8")
    return json.loads(body or "{}")


def read_payload(handler: Any) -> dict:
    content_type = handler.headers.get("Content-Type") or ""
    if not content_type.startswith("multipart/form-data"):
        return read_json(handler)
    length = int(handler.headers.get("Content-Length") or "0")
    body = handler.rfile.read(length)
    match = re.search(r"boundary=([^;]+)", content_type)
    if not match:
        raise ValueError("Boundary do multipart nao informado.")
    boundary = ("--" + match.group(1).strip().strip('"')).encode("utf-8")
    payload: dict = {}
    for raw_part in body.split(boundary):
        part = raw_part.strip(b"\r\n")
        if not part or part == b"--":
            continue
        if part.endswith(b"--"):
            part = part[:-2].rstrip(b"\r\n")
        header_bytes, sep, value_bytes = part.partition(b"\r\n\r\n")
        if not sep:
            continue
        headers_text = header_bytes.decode("utf-8", errors="replace")
        name_match = re.search(r'name="([^"]+)"', headers_text)
        if not name_match:
            continue
        field_name = name_match.group(1)
        file_match = re.search(r'filename="([^"]*)"', headers_text)
        value_bytes = value_bytes.rstrip(b"\r\n")
        if file_match:
            payload["file_name"] = file_match.group(1) or scalar_text(payload.get("file_name")) or "planilha"
            payload["_file_bytes"] = value_bytes
            continue
        text = value_bytes.decode("utf-8", errors="replace")
        if field_name in {"mappings", "manual_conflict_choices"}:
            payload[field_name] = json.loads(text or ("[]" if field_name == "mappings" else "{}"))
        else:
            payload[field_name] = text
    return payload


def send_file(handler: Any, path: Path) -> None:
    if not path.exists() or not path.is_file():
        handler.send_error(404)
        return
    stat = path.stat()
    is_html = path.suffix.lower() in {".html", ".htm"}
    content_type = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
    if is_html and content_type == "text/html":
        content_type = "text/html; charset=utf-8"
    cache_control = "no-store" if is_html else "public, max-age=3600, must-revalidate"
    etag = f'W/"{stat.st_mtime_ns:x}-{stat.st_size:x}"'
    if handler.headers.get("If-None-Match") == etag:
        handler.send_response(304)
        handler.send_header("ETag", etag)
        handler.send_header("Cache-Control", cache_control)
        if is_html:
            handler.send_header("Content-Language", "pt-BR")
        handler.end_headers()
        return
    body = path.read_bytes()
    handler.send_response(200)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Cache-Control", cache_control)
    if is_html:
        handler.send_header("Content-Language", "pt-BR")
    handler.send_header("ETag", etag)
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def send_binary(handler: Any, body: bytes, content_type: str, filename: str = "") -> None:
    handler.send_response(200)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Cache-Control", "no-store")
    if filename:
        handler.send_header("Content-Disposition", f'attachment; filename="{filename}"')
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)
