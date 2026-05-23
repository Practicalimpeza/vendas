from __future__ import annotations

import subprocess
import sys
import time
import tkinter as tk
from tkinter import messagebox, simpledialog
import webbrowser
import ctypes
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from tenant_launcher import (
    ROOT,
    TENANTS_DIR,
    choose_port,
    list_tenants,
    read_json,
    slugify,
    start_app_process,
    tenant_label,
    wait_for_http_ready,
)


HOST = "127.0.0.1"
START_PORT = 8010
COLORS = {
    "bg": "#edf2ee",
    "panel": "#ffffff",
    "ink": "#112018",
    "muted": "#516257",
    "line": "#d7e1da",
    "green": "#166b47",
    "green_dark": "#0f4c32",
    "soft": "#f5f8f6",
    "soft_green": "#edf7f1",
}
FONT = "Segoe UI"


def enable_windows_dpi_awareness() -> None:
    if sys.platform != "win32":
        return
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(1)
    except (AttributeError, OSError):
        try:
            ctypes.windll.user32.SetProcessDPIAware()
        except (AttributeError, OSError):
            pass


class TenantLauncher(tk.Tk):
    def __init__(self) -> None:
        enable_windows_dpi_awareness()
        super().__init__()
        self.title("Pulso - escolher empresa")
        self.geometry("960x660")
        self.minsize(840, 560)
        self.configure(bg=COLORS["bg"])
        self.tk.call("tk", "scaling", 1.35)
        self.process: subprocess.Popen | None = None
        self.current_url = ""
        self.logo_refs: list[tk.PhotoImage] = []
        self.protocol("WM_DELETE_WINDOW", self.close_window)
        self.build_shell()
        self.render_tenants()

    def build_shell(self) -> None:
        self.header = tk.Frame(self, bg=COLORS["bg"])
        self.header.pack(fill="x", padx=34, pady=(28, 18))

        title_box = tk.Frame(self.header, bg=COLORS["bg"])
        title_box.pack(side="left", fill="x", expand=True)
        tk.Label(
            title_box,
            text="Pulso",
            bg=COLORS["bg"],
            fg=COLORS["ink"],
            font=(FONT, 28, "bold"),
        ).pack(anchor="w")
        tk.Label(
            title_box,
            text="Escolha a empresa que quer abrir",
            bg=COLORS["bg"],
            fg=COLORS["muted"],
            font=(FONT, 12),
        ).pack(anchor="w", pady=(2, 0))

        tk.Button(
            self.header,
            text="+ Nova empresa",
            command=self.create_tenant,
            bg=COLORS["green"],
            fg="#ffffff",
            activebackground=COLORS["green_dark"],
            activeforeground="#ffffff",
            relief="flat",
            padx=22,
            pady=13,
            font=(FONT, 12, "bold"),
            cursor="hand2",
        ).pack(side="right")

        self.content = tk.Frame(self, bg=COLORS["bg"])
        self.content.pack(fill="both", expand=True, padx=34)

        self.cards = tk.Frame(self.content, bg=COLORS["bg"])
        self.cards.pack(fill="both", expand=True)

        self.footer = tk.Frame(self, bg=COLORS["panel"], highlightbackground=COLORS["line"], highlightthickness=1)
        self.footer.pack(fill="x", padx=34, pady=(16, 28))
        self.status = tk.Label(
            self.footer,
            text="Nenhuma empresa aberta.",
            bg=COLORS["panel"],
            fg=COLORS["muted"],
            anchor="w",
            font=(FONT, 11),
        )
        self.status.pack(side="left", fill="x", expand=True, padx=18, pady=15)
        self.stop_button = tk.Button(
            self.footer,
            text="Parar servidor",
            command=self.stop_server,
            state="disabled",
            relief="flat",
            bg="#f4f6f4",
            fg=COLORS["ink"],
            activebackground="#e8eee9",
            activeforeground=COLORS["ink"],
            font=(FONT, 10, "bold"),
            padx=16,
            pady=10,
            cursor="hand2",
        )
        self.stop_button.pack(side="right", padx=(0, 14))
        self.open_button = tk.Button(
            self.footer,
            text="Abrir navegador",
            command=self.open_browser,
            state="disabled",
            relief="flat",
            bg=COLORS["green"],
            fg="#ffffff",
            activebackground=COLORS["green_dark"],
            activeforeground="#ffffff",
            font=(FONT, 10, "bold"),
            padx=16,
            pady=10,
            cursor="hand2",
        )
        self.open_button.pack(side="right", padx=(0, 10))

    def render_tenants(self) -> None:
        for child in self.cards.winfo_children():
            child.destroy()
        self.logo_refs.clear()
        tenants = list_tenants()
        name_counts = {
            tenant_label(tenant): sum(1 for item in tenants if tenant_label(item) == tenant_label(tenant))
            for tenant in tenants
        }
        if not tenants:
            tk.Label(
                self.cards,
                text="Nenhuma empresa encontrada. Clique em Nova empresa para começar.",
                bg=COLORS["bg"],
                fg=COLORS["muted"],
                font=(FONT, 13),
            ).pack(anchor="center", expand=True)
            return
        for index, tenant in enumerate(tenants):
            card = self.tenant_card(tenant, show_local_name=name_counts.get(tenant_label(tenant), 0) > 1)
            card.grid(row=index // 2, column=index % 2, sticky="nsew", padx=10, pady=10)
        self.cards.grid_columnconfigure(0, weight=1)
        self.cards.grid_columnconfigure(1, weight=1)

    def tenant_card(self, tenant: str, show_local_name: bool = False) -> tk.Frame:
        card = tk.Frame(
            self.cards,
            bg=COLORS["panel"],
            highlightbackground=COLORS["line"],
            highlightthickness=1,
            padx=22,
            pady=20,
        )
        logo = self.load_logo_image(tenant)
        logo_box = tk.Frame(card, width=112, height=112, bg=COLORS["soft"], highlightbackground=COLORS["line"], highlightthickness=1)
        logo_box.pack(side="left")
        logo_box.pack_propagate(False)
        if logo:
            tk.Label(logo_box, image=logo, bg=COLORS["soft"]).pack(expand=True)
            self.logo_refs.append(logo)
        else:
            initials = "".join(part[:1] for part in tenant_label(tenant).split()[:2]).upper() or "P"
            tk.Label(
                logo_box,
                text=initials,
                bg=COLORS["soft"],
                fg=COLORS["green"],
                font=(FONT, 28, "bold"),
            ).pack(expand=True)

        info = tk.Frame(card, bg=COLORS["panel"])
        info.pack(side="left", fill="both", expand=True, padx=(18, 8))
        tk.Label(
            info,
            text=tenant_label(tenant),
            bg=COLORS["panel"],
            fg=COLORS["ink"],
            anchor="w",
            font=(FONT, 18, "bold"),
        ).pack(fill="x", anchor="w")
        subtitle = self.tenant_subtitle(tenant, show_local_name=show_local_name)
        tk.Label(
            info,
            text=subtitle,
            bg=COLORS["panel"],
            fg=COLORS["muted"],
            anchor="w",
            font=(FONT, 11),
        ).pack(fill="x", anchor="w", pady=(5, 14))
        tk.Button(
            info,
            text="Abrir empresa",
            command=lambda selected=tenant: self.start_tenant(selected),
            bg=COLORS["green"],
            fg="#ffffff",
            activebackground=COLORS["green_dark"],
            activeforeground="#ffffff",
            relief="flat",
            padx=18,
            pady=11,
            font=(FONT, 11, "bold"),
            cursor="hand2",
        ).pack(anchor="w")
        return card

    def tenant_subtitle(self, tenant: str, show_local_name: bool = False) -> str:
        config = read_json(TENANTS_DIR / tenant / "app_config.json")
        public = config.get("public") if isinstance(config.get("public"), dict) else {}
        subtitle = str(public.get("app_subtitle") or "").strip()
        base = subtitle or "Mesa de operacao"
        return f"{base} • pasta local {tenant}" if show_local_name else base

    def logo_path_for_tenant(self, tenant: str) -> Path | None:
        config = read_json(TENANTS_DIR / tenant / "app_config.json")
        public = config.get("public") if isinstance(config.get("public"), dict) else {}
        logo_path = str(public.get("logo_path") or "").strip()
        parts = [part for part in logo_path.strip("/").split("/") if part]
        if len(parts) == 3 and parts[0] == "tenant-assets":
            path = TENANTS_DIR / parts[1] / "assets" / Path(parts[2]).name
        elif len(parts) == 2 and parts[0] == "brand":
            path = ROOT / "web" / "brand" / Path(parts[1]).name
        else:
            return None
        return path if path.exists() and path.suffix.lower() in {".png", ".gif"} else None

    def load_logo_image(self, tenant: str) -> tk.PhotoImage | None:
        path = self.logo_path_for_tenant(tenant)
        if not path:
            return None
        try:
            image = tk.PhotoImage(file=str(path))
        except tk.TclError:
            return None
        factor = max(1, int(max(image.width() / 88, image.height() / 88)))
        if factor > 1:
            image = image.subsample(factor, factor)
        return image

    def create_tenant(self) -> None:
        name = simpledialog.askstring("Nova empresa", "Nome da empresa:", parent=self)
        if not name:
            return
        base = slugify(name)
        if not base:
            messagebox.showerror("Nome invalido", "Informe um nome com letras ou numeros.")
            return
        slug = base
        counter = 2
        while (TENANTS_DIR / slug).exists():
            slug = f"{base}_{counter}"
            counter += 1
        (TENANTS_DIR / slug).mkdir(parents=True, exist_ok=True)
        self.render_tenants()
        self.start_tenant(slug)

    def start_tenant(self, tenant: str) -> None:
        self.stop_server(silent=True)
        try:
            port = choose_port(START_PORT, HOST)
        except RuntimeError as exc:
            messagebox.showerror("Porta indisponivel", str(exc))
            return
        self.current_url = f"http://{HOST}:{port}"
        self.status.config(text=f"Abrindo {tenant_label(tenant)} em {self.current_url}")
        self.update_idletasks()
        try:
            self.process, log_path = start_app_process(tenant, HOST, port)
            wait_for_http_ready(self.current_url, self.process, log_path)
        except (OSError, RuntimeError) as exc:
            self.stop_server(silent=True)
            messagebox.showerror("Nao foi possivel abrir", str(exc))
            self.process = None
            self.current_url = ""
            return
        self.status.config(text=f"Abrindo {tenant_label(tenant)} em {self.current_url}")
        self.stop_button.config(state="normal")
        self.open_button.config(state="normal")
        self.after(50, self.open_browser)

    def open_browser(self) -> None:
        if self.current_url:
            webbrowser.open(self.current_url)

    def stop_server(self, silent: bool = False) -> None:
        if self.process and self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
        self.process = None
        self.current_url = ""
        self.stop_button.config(state="disabled")
        self.open_button.config(state="disabled")
        if not silent:
            self.status.config(text="Servidor parado.")

    def close_window(self) -> None:
        if self.process and self.process.poll() is None:
            should_stop = messagebox.askyesno("Fechar iniciador", "Parar o servidor aberto antes de sair?")
            if should_stop:
                self.stop_server(silent=True)
        self.destroy()


if __name__ == "__main__":
    TenantLauncher().mainloop()
