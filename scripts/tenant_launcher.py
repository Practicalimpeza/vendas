from __future__ import annotations

import argparse
import json
import os
import socket
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TENANTS_DIR = ROOT / "data" / "tenants"
HIDDEN_TENANT_PREFIXES = ("codex_",)
PARTNER_CONFIG_PATH = ROOT / "config" / "partners" / "default.json"


def slugify(value: str) -> str:
    cleaned = "".join(char.lower() if char.isalnum() else "_" for char in value.strip())
    return "_".join(part for part in cleaned.split("_") if part)


def read_json(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def tenant_label(slug: str) -> str:
    config = read_json(TENANTS_DIR / slug / "app_config.json")
    public = config.get("public") if isinstance(config.get("public"), dict) else {}
    app_name = str(public.get("app_name") or "").strip()
    return app_name or slug


def tenant_app_name(slug: str) -> str:
    config = read_json(TENANTS_DIR / slug / "app_config.json")
    public = config.get("public") if isinstance(config.get("public"), dict) else {}
    return str(public.get("app_name") or "").strip() or slug


def active_partner_id() -> str:
    config = read_json(PARTNER_CONFIG_PATH)
    partner = config.get("partner") if isinstance(config.get("partner"), dict) else {}
    return slugify(str(partner.get("id") or "")) or "default"


def tenant_partner_id(slug: str) -> str:
    config = read_json(TENANTS_DIR / slug / "app_config.json")
    partner = config.get("partner") if isinstance(config.get("partner"), dict) else {}
    return slugify(str(partner.get("id") or "")) or "default"


def list_tenants() -> list[str]:
    if not TENANTS_DIR.exists():
        return []
    partner_id = active_partner_id()
    tenants = [
        path.name
        for path in TENANTS_DIR.iterdir()
        if path.is_dir() and not path.name.startswith(HIDDEN_TENANT_PREFIXES) and tenant_partner_id(path.name) == partner_id
    ]
    return sorted(tenants, key=lambda item: tenant_label(item).lower())


def port_is_free(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.2)
        try:
            sock.bind((host, port))
        except OSError:
            return False
    return True


def choose_port(preferred: int, host: str = "127.0.0.1") -> int:
    for port in range(preferred, preferred + 40):
        if port_is_free(port, host):
            return port
    raise RuntimeError(f"Nenhuma porta livre encontrada a partir de {preferred}.")


def launcher_log_path(tenant: str, port: int) -> Path:
    logs_dir = ROOT / "data" / "local" / "launcher_logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    safe_tenant = slugify(tenant) or "tenant"
    stamp = time.strftime("%Y%m%d_%H%M%S")
    return logs_dir / f"{stamp}_{safe_tenant}_{port}.log"


def hidden_startupinfo() -> subprocess.STARTUPINFO | None:
    if sys.platform != "win32":
        return None
    startupinfo = subprocess.STARTUPINFO()
    startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    startupinfo.wShowWindow = 0
    return startupinfo


def hidden_creationflags() -> int:
    if sys.platform != "win32":
        return 0
    return int(getattr(subprocess, "CREATE_NO_WINDOW", 0))


def log_tail(path: Path, limit: int = 1800) -> str:
    if not path.exists():
        return ""
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""
    return text[-limit:].strip()


def print_menu(tenants: list[str]) -> None:
    print("")
    print("Escolher empresa")
    print("=" * 32)
    for index, tenant in enumerate(tenants, start=1):
        print(f"{index}. {tenant_label(tenant)}")
    print(f"{len(tenants) + 1}. Novo tenant / onboarding")
    print("")


def choose_tenant(args: argparse.Namespace) -> str:
    if args.tenant:
        return slugify(args.tenant)
    tenants = list_tenants()
    if not tenants:
        print("Nenhum tenant encontrado. Vamos criar o primeiro.")
        raw = input("Identificador do tenant: ").strip()
        slug = slugify(raw)
        if not slug:
            raise SystemExit("Tenant invalido.")
        return slug
    print_menu(tenants)
    choice = input("Escolha uma opcao: ").strip()
    if not choice:
        choice = "1"
    if not choice.isdigit():
        slug = slugify(choice)
        if not slug:
            raise SystemExit("Tenant invalido.")
        return slug
    selected = int(choice)
    if 1 <= selected <= len(tenants):
        return tenants[selected - 1]
    if selected == len(tenants) + 1:
        raw = input("Digite o identificador do novo tenant: ").strip()
        slug = slugify(raw)
        if not slug:
            raise SystemExit("Tenant invalido.")
        return slug
    raise SystemExit("Opcao invalida.")


def build_command(tenant: str, host: str, port: int) -> list[str]:
    return [
        sys.executable,
        "-u",
        str(ROOT / "scripts" / "serve_app.py"),
        "--tenant",
        tenant,
        "--host",
        host,
        "--port",
        str(port),
    ]


def start_app_process(tenant: str, host: str, port: int) -> tuple[subprocess.Popen, Path]:
    log_path = launcher_log_path(tenant, port)
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    log_file = log_path.open("a", encoding="utf-8")
    try:
        process = subprocess.Popen(
            build_command(tenant, host, port),
            cwd=ROOT,
            stdin=subprocess.DEVNULL,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            startupinfo=hidden_startupinfo(),
            creationflags=hidden_creationflags(),
            env=env,
        )
    except Exception:
        log_file.close()
        raise
    log_file.close()
    return process, log_path


def wait_for_http_ready(url: str, process: subprocess.Popen, log_path: Path, timeout: float = 15.0) -> None:
    deadline = time.monotonic() + timeout
    last_error = ""
    while time.monotonic() < deadline:
        if process.poll() is not None:
            details = log_tail(log_path)
            message = f"Servidor encerrou antes de responder em {url}. Log: {log_path}"
            if details:
                message += f"\nUltimas linhas do log:\n{details}"
            raise RuntimeError(message)
        try:
            with urllib.request.urlopen(url, timeout=0.5) as response:
                if response.status < 500:
                    return
        except Exception as exc:
            last_error = str(exc)
        time.sleep(0.2)
    details = log_tail(log_path)
    message = f"Servidor nao respondeu em {url} depois de {timeout:.0f}s. Log: {log_path}"
    if last_error:
        message += f"\nUltimo erro: {last_error}"
    if details:
        message += f"\nUltimas linhas do log:\n{details}"
    raise RuntimeError(message)


def main() -> None:
    parser = argparse.ArgumentParser(description="Inicia uma empresa/tenant local.")
    parser.add_argument("--tenant", default="", help="Abre diretamente um tenant.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8010, help="Porta preferencial.")
    parser.add_argument("--no-browser", action="store_true", help="Não abrir o navegador automaticamente.")
    args = parser.parse_args()

    tenant = choose_tenant(args)
    port = choose_port(args.port, args.host)
    url = f"http://{args.host}:{port}"
    label = tenant_label(tenant)
    db_path = TENANTS_DIR / tenant / "database.sqlite3"

    print("")
    print(f"Abrindo: {label}")
    print(f"URL: {url}")
    print(f"Dados locais: {db_path.parent}")
    print("Feche esta janela ou pressione Ctrl+C para parar o servidor.")
    print("")

    process, log_path = start_app_process(tenant, args.host, port)
    try:
        wait_for_http_ready(url, process, log_path)
    except RuntimeError as exc:
        print(str(exc))
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
        raise SystemExit(1)
    if not args.no_browser:
        webbrowser.open(url)
    try:
        process.wait()
    except KeyboardInterrupt:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()


if __name__ == "__main__":
    main()
