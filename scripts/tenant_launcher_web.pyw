from __future__ import annotations

import base64
import ctypes
import json
import mimetypes
import os
import shutil
import sqlite3
import subprocess
import sys
import threading
import time
import unicodedata
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from tenant_launcher import (
    ROOT,
    TENANTS_DIR,
    choose_port,
    read_json,
    slugify,
    start_app_process,
    tenant_label,
    wait_for_http_ready,
)
from tenant_session import clear_client_tenant, read_last_client_tenant, remember_client_tenant


HOST = "127.0.0.1"
LAUNCHER_MODE = (os.environ.get("PULSO_LAUNCHER_MODE") or "client").strip().lower()
if LAUNCHER_MODE not in {"client", "partner", "platform"}:
    LAUNCHER_MODE = "client"
LAUNCHER_BUILD = "20260523_remove_flow"
LAUNCHER_PORTS = {"client": 8765, "partner": 8766, "platform": 8767}
LAUNCHER_PORT = LAUNCHER_PORTS.get(LAUNCHER_MODE, 8765)
APP_START_PORT = 8010
HIDDEN_TENANT_PREFIXES = ("codex_",)
PARTNER_CONFIG_PATH = ROOT / "config" / "partners" / "default.json"
REPRESENTATIVES_CONFIG_PATH = ROOT / "config" / "partners" / "representatives.json"
PARTNER_ASSETS_DIR = ROOT / "config" / "partners" / "assets"
WINDOW_PROFILES_DIR = ROOT / "data" / "local" / "desktop_windows"

APP_HTML = r"""<!doctype html>
<html lang="pt-BR" translate="no">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Language" content="pt-BR" />
  <meta name="google" content="notranslate" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Escolher empresa</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4f6f5;
      --surface: #ffffff;
      --ink: #102019;
      --muted: #5d6c63;
      --soft: #8a978f;
      --line: #d9e3dd;
      --green: #14744b;
      --green-strong: #0f5e3c;
      --shadow: 0 18px 48px rgba(16, 32, 25, 0.09);
      font-family: "Segoe UI", Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; overflow-x: hidden; }
    body {
      background:
        linear-gradient(135deg, rgba(20, 116, 75, 0.06), transparent 34%),
        linear-gradient(180deg, #fafcfb, var(--bg));
      color: var(--ink);
      font-size: 15px;
      -webkit-font-smoothing: antialiased;
      text-rendering: geometricPrecision;
    }
    .app-chrome {
      display: none;
    }
    .chrome-brand {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .chrome-mark {
      width: 40px;
      height: 40px;
      display: grid;
      place-items: center;
      flex: 0 0 auto;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: #fff;
      overflow: hidden;
      box-shadow: 0 8px 22px rgba(16, 32, 25, .07);
    }
    .chrome-mark img {
      max-width: 32px;
      max-height: 32px;
      object-fit: contain;
    }
    .chrome-initials {
      color: var(--green);
      font-size: 18px;
      font-weight: 900;
    }
    .chrome-title {
      min-width: 0;
    }
    .chrome-title strong {
      display: block;
      overflow: hidden;
      color: var(--ink);
      font-size: 15px;
      font-weight: 850;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .chrome-title span {
      display: block;
      margin-top: 2px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
    }
    .chrome-meta {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 8px;
    }
    .chrome-pill {
      display: inline-flex;
      align-items: center;
      min-height: 30px;
      padding: 0 11px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: #fff;
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
      box-shadow: 0 6px 18px rgba(16, 32, 25, .045);
    }
    .chrome-pill.mode {
      border-color: rgba(20, 116, 75, .28);
      color: var(--green);
      background: #f0faf5;
    }
    .shell {
      width: min(940px, calc(100vw - 48px));
      margin: 0 auto;
      padding: 30px 0 36px;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      margin-bottom: 26px;
      padding-bottom: 22px;
      border-bottom: 1px solid rgba(217, 227, 221, .85);
    }
    .header-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 10px;
    }
    .brand-row {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .partner-logo {
      width: 54px;
      height: 54px;
      display: grid;
      place-items: center;
      flex: 0 0 auto;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: #fff;
      overflow: hidden;
    }
    .partner-logo[hidden] {
      display: none;
    }
    .partner-logo img {
      display: block;
      max-width: 44px;
      max-height: 44px;
      object-fit: contain;
    }
    .kicker {
      margin: 0 0 10px;
      color: var(--green);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .title h1 {
      margin: 0;
      font-size: 38px;
      line-height: 1;
      letter-spacing: 0;
    }
    .title p {
      margin: 12px 0 0;
      color: var(--muted);
      font-size: 15px;
      line-height: 1.45;
    }
    .new-button, .primary-button, .ghost-button {
      border: 0;
      border-radius: 8px;
      min-height: 40px;
      padding: 0 16px;
      font: inherit;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: transform .16s ease, box-shadow .16s ease, background .16s ease;
    }
    .new-button, .primary-button {
      color: #fff;
      background: var(--green);
      box-shadow: 0 10px 22px rgba(20, 116, 75, .18);
    }
    .new-button:hover, .primary-button:hover {
      background: var(--green-strong);
      transform: translateY(-1px);
    }
    .ghost-button {
      color: var(--ink);
      background: #eef4f0;
    }
    .ghost-button:disabled {
      display: none;
    }
    .runbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      min-height: 56px;
      margin-bottom: 18px;
      padding: 11px 12px 11px 16px;
      border: 1px solid rgba(217, 227, 221, .95);
      border-radius: 8px;
      background: rgba(255, 255, 255, .88);
      box-shadow: var(--shadow);
    }
    .runbar[hidden] {
      display: none;
    }
    .runbar span {
      color: var(--muted);
      font-size: 14px;
      font-weight: 700;
    }
    .runbar strong {
      color: var(--ink);
      font-size: 15px;
    }
    .status-action {
      display: flex;
      gap: 10px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
      gap: 14px;
      justify-content: start;
    }
    .launcher-footer {
      display: flex;
      justify-content: center;
      margin-top: 22px;
      padding-bottom: 18px;
    }
    .remove-company-link {
      border: 0;
      background: transparent;
      color: #9f2d2d;
      font: inherit;
      font-size: 14px;
      font-weight: 800;
      text-decoration: underline;
      text-underline-offset: 3px;
      cursor: pointer;
    }
    .remove-company-link:hover {
      color: #7c3030;
    }
    .delete-mode-note {
      margin: -2px 0 18px;
      padding: 12px 14px;
      border: 1px solid #f0c9c9;
      border-radius: 8px;
      background: #fffafa;
      color: #7c3030;
      font-size: 13px;
      font-weight: 800;
    }
    .delete-mode-note[hidden] {
      display: none;
    }
    .mode-panel {
      display: grid;
      gap: 8px;
      margin-bottom: 18px;
      padding: 14px 16px;
      border: 1px solid rgba(217, 227, 221, .95);
      border-radius: 8px;
      background: #fff;
      box-shadow: var(--shadow);
    }
    .mode-panel[hidden] {
      display: none;
    }
    .mode-panel span {
      color: var(--green);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: .06em;
      text-transform: uppercase;
    }
    .mode-panel strong {
      color: var(--ink);
      font-size: 17px;
    }
    .mode-panel p {
      margin: 0;
      color: var(--muted);
      line-height: 1.45;
    }
    .card {
      min-height: 184px;
      display: grid;
      grid-template-rows: auto 1fr auto;
      gap: 14px;
      padding: 18px 18px 16px;
      border: 1px solid rgba(217, 227, 221, .95);
      border-radius: 10px;
      background: rgba(255, 255, 255, .94);
      box-shadow: 0 10px 30px rgba(16, 32, 25, .055);
      transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease;
      cursor: pointer;
    }
    .card:hover {
      border-color: rgba(20, 116, 75, .34);
      box-shadow: var(--shadow);
      transform: translateY(-1px);
    }
    .card:focus-visible {
      outline: 3px solid rgba(20, 116, 75, .25);
      outline-offset: 3px;
    }
    .card.delete-mode {
      border-color: rgba(159, 45, 45, .28);
    }
    .card.delete-mode:hover,
    .card.delete-mode:focus-visible {
      border-color: rgba(159, 45, 45, .55);
      box-shadow: 0 18px 48px rgba(159, 45, 45, .10);
    }
    .card-top {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      min-width: 0;
    }
    .logo {
      width: 58px;
      height: 58px;
      display: grid;
      place-items: center;
      flex: 0 0 auto;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      overflow: hidden;
    }
    .logo img {
      display: block;
      max-width: 48px;
      max-height: 48px;
      object-fit: contain;
    }
    .initials {
      color: var(--green);
      font-size: 30px;
      font-weight: 900;
    }
    .card-title {
      min-width: 0;
    }
    .card-title h2 {
      margin: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 22px;
      line-height: 1.14;
      letter-spacing: 0;
    }
    .company-code {
      display: inline-flex;
      align-items: center;
      width: fit-content;
      margin-top: 7px;
      border: 1px solid rgba(20, 116, 75, .18);
      border-radius: 999px;
      padding: 4px 9px;
      background: rgba(20, 116, 75, .07);
      color: var(--green);
      font-size: 12px;
      font-weight: 900;
      letter-spacing: .03em;
      text-transform: uppercase;
    }
    .company-info {
      display: grid;
      gap: 8px;
      align-self: start;
    }
    .user-count {
      color: var(--green);
      font-size: 13px;
      font-weight: 800;
    }
    .address {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.45;
    }
    .pending {
      color: var(--soft);
      font-size: 13px;
      line-height: 1.45;
    }
    .card-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 12px;
      align-self: end;
      margin-top: 4px;
    }
    .delete-card-hint {
      color: #9f2d2d;
      font-size: 13px;
      font-weight: 900;
    }
    .danger-button {
      color: #9f2d2d;
      background: #fff2f2;
      border: 1px solid #f0c9c9;
      box-shadow: none;
    }
    .danger-button:hover {
      color: #fff;
      background: #9f2d2d;
      transform: translateY(-1px);
    }
    .empty {
      grid-column: 1 / -1;
      padding: 38px;
      border: 1px dashed var(--line);
      border-radius: 8px;
      background: rgba(255,255,255,.72);
      color: var(--muted);
      text-align: center;
      font-weight: 700;
    }
    .modal-backdrop {
      position: fixed;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 24px;
      background: rgba(16, 32, 25, .34);
      z-index: 10;
    }
    .modal-backdrop[hidden] {
      display: none;
    }
    .modal {
      width: min(520px, 100%);
      border: 1px solid rgba(217, 227, 221, .95);
      border-radius: 8px;
      background: #fff;
      box-shadow: 0 28px 80px rgba(16, 32, 25, .20);
      padding: 22px;
    }
    .modal h2 {
      margin: 0;
      font-size: 22px;
      line-height: 1.15;
    }
    .modal p {
      margin: 8px 0 18px;
      color: var(--muted);
      line-height: 1.45;
    }
    .field {
      display: grid;
      gap: 7px;
      margin-bottom: 18px;
    }
    .field span {
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
    }
    .field input,
    .field select {
      width: 100%;
      min-height: 42px;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 0 12px;
      color: var(--ink);
      font: inherit;
      outline: none;
      background: #fff;
    }
    .field input:focus,
    .field select:focus {
      border-color: var(--green);
      box-shadow: 0 0 0 3px rgba(20, 116, 75, .12);
    }
    .delete-details {
      display: grid;
      gap: 8px;
      margin: -4px 0 16px;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fafcfb;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.4;
    }
    .delete-details[hidden],
    .delete-confirm-step[hidden] {
      display: none;
    }
    .delete-details strong {
      color: var(--ink);
      font-size: 16px;
    }
    .delete-confirm-step {
      margin: 0 0 16px;
      padding: 12px;
      border: 1px solid #f0c9c9;
      border-radius: 8px;
      background: #fffafa;
    }
    .delete-confirm-step p {
      margin: 0 0 10px;
      color: #7c3030;
      font-size: 13px;
    }
    .partner-onboarding {
      width: min(720px, 100%);
    }
    .partner-onboarding .modal-actions {
      margin-top: 4px;
    }
    .partner-onboarding-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0 12px;
    }
    .partner-onboarding-field-full {
      grid-column: 1 / -1;
    }
    .partner-onboarding-strip {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin: 2px 0 18px;
    }
    .partner-onboarding-strip article {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: #fafcfb;
    }
    .partner-onboarding-strip strong,
    .partner-onboarding-strip span {
      display: block;
    }
    .partner-onboarding-strip strong {
      color: var(--ink);
      font-size: 13px;
    }
    .partner-onboarding-strip span {
      margin-top: 4px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.35;
    }
    .modal-error {
      min-height: 20px;
      margin-bottom: 12px;
      color: #9f2d2d;
      font-size: 13px;
      font-weight: 700;
    }
    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
    @media (max-width: 720px) {
      .shell { width: min(100vw - 24px, 1120px); padding-top: 24px; }
      .app-chrome { align-items: stretch; flex-direction: column; padding: 12px; }
      .chrome-meta { justify-content: flex-start; }
      header { align-items: stretch; flex-direction: column; }
      .title h1 { font-size: 36px; }
      .new-button { width: 100%; }
      .header-actions { width: 100%; }
      .header-actions button { flex: 1; }
      .partner-onboarding-grid,
      .partner-onboarding-strip { grid-template-columns: 1fr; }
      .runbar { align-items: stretch; flex-direction: column; }
      .status-action { width: 100%; }
      .status-action button { flex: 1; }
      .grid { grid-template-columns: 1fr; gap: 12px; }
      .card { min-width: 0; }
      .card-actions { justify-content: stretch; }
      .card-actions button { width: 100%; }
    }
  </style>
</head>
<body>
  <section class="app-chrome" aria-label="Janela do aplicativo">
    <div class="chrome-brand">
      <div class="chrome-mark" id="chromeLogoBox"><span class="chrome-initials" id="chromeInitials">S</span><img id="chromeLogo" alt="" hidden></div>
      <div class="chrome-title">
        <strong id="chromeTitle">Sistema</strong>
        <span id="chromeSubtitle">Ambiente local seguro</span>
      </div>
    </div>
    <div class="chrome-meta">
      <span class="chrome-pill mode" id="chromeMode">Cliente</span>
      <span class="chrome-pill">Dados locais</span>
      <span class="chrome-pill" id="chromeLicense">Licença local</span>
    </div>
  </section>
  <main class="shell">
    <header>
      <div class="title">
        <div class="brand-row">
          <div class="partner-logo" id="partnerLogoBox" hidden><img id="partnerLogo" alt=""></div>
          <div>
            <p class="kicker" id="launcherKicker">Central do consultor</p>
            <h1 id="launcherTitle">Clientes</h1>
            <p id="launcherSubtitle">Escolha uma empresa cliente para continuar ou prepare uma nova implantação.</p>
          </div>
        </div>
      </div>
      <div class="header-actions">
        <button class="ghost-button" type="button" id="switchRepresentative" hidden>Representantes</button>
        <button class="new-button" type="button" id="newTenant">Nova empresa</button>
      </div>
    </header>
    <section class="runbar" id="runbar" hidden>
      <div>
        <span>Empresa aberta</span><br />
        <strong id="statusText"></strong>
      </div>
      <div class="status-action">
        <button class="ghost-button" id="stopServer" type="button" disabled>Encerrar</button>
      </div>
    </section>
    <section class="mode-panel" id="modePanel" hidden></section>
    <section class="delete-mode-note" id="deleteModeNote" hidden>Clique no card da empresa que deseja remover.</section>
    <section class="grid" id="tenantGrid"></section>
    <footer class="launcher-footer">
      <button class="remove-company-link" type="button" id="removeTenantMode">Remover empresa</button>
    </footer>
  </main>
  <div class="modal-backdrop" id="tenantModal" hidden>
    <form class="modal" id="tenantForm">
      <h2 id="tenantModalTitle">Nova implantação</h2>
      <p id="tenantModalCopy">Informe o nome da empresa. Depois disso, a instalação abre uma implantação guiada para configurar acesso, documentos e dados.</p>
      <label class="field">
        <span>Nome da empresa</span>
        <input id="tenantName" name="tenantName" autocomplete="organization" required />
      </label>
      <label class="field">
        <span>Código da empresa</span>
        <input id="tenantCode" name="tenantCode" autocomplete="off" maxlength="24" placeholder="Ex: CLI-001" required />
      </label>
      <div class="modal-error" id="modalError" role="alert"></div>
      <div class="modal-actions">
        <button class="ghost-button" type="button" id="cancelTenant">Cancelar</button>
        <button class="primary-button" type="submit" id="tenantModalSubmit">Criar e começar</button>
      </div>
    </form>
  </div>
  <div class="modal-backdrop" id="manageModal" hidden>
    <form class="modal" id="deleteTenantForm">
      <h2>Remover empresa</h2>
      <p>Confirme a empresa abaixo. A exclusão remove os dados locais dela e não pode ser desfeita.</p>
      <div class="delete-details" id="deleteTenantDetails" hidden></div>
      <div class="delete-confirm-step" id="deleteConfirmStep" hidden>
        <p id="deleteConfirmHelp">Digite o código da empresa para liberar a exclusão definitiva.</p>
        <label class="field">
          <span id="deleteConfirmLabel">Código da empresa</span>
          <input id="deleteConfirmInput" autocomplete="off" />
        </label>
      </div>
      <div class="modal-error" id="deleteModalError" role="alert"></div>
      <div class="modal-actions">
        <button class="ghost-button" type="button" id="cancelManage">Cancelar</button>
        <button class="danger-button" type="submit" id="confirmDelete" disabled>Excluir definitivamente</button>
      </div>
    </form>
  </div>
  <div class="modal-backdrop" id="partnerOnboardingModal" hidden>
    <form class="modal partner-onboarding" id="partnerOnboardingForm">
      <h2 id="partnerOnboardingTitle">Primeiro acesso do representante</h2>
      <p id="partnerOnboardingCopy">Configure como esse pacote vai identificar você ao preparar e acompanhar empresas cliente.</p>
      <div class="partner-onboarding-strip">
        <article><strong>Seu código</strong><span>Diferencia representantes e vincula novos clientes ao seu pacote.</span></article>
        <article><strong>Sua marca</strong><span>Nome e cor aparecem no iniciador e nas implantações locais.</span></article>
        <article><strong>Próximo passo</strong><span>Depois disso, cadastre a primeira empresa cliente.</span></article>
      </div>
      <div class="partner-onboarding-grid">
        <label class="field partner-onboarding-field-full">
          <span>Nome do representante ou consultoria</span>
          <input id="partnerNameInput" autocomplete="organization" maxlength="120" required />
        </label>
        <label class="field">
          <span>Código do representante</span>
          <input id="partnerCodeInput" autocomplete="off" maxlength="40" placeholder="Ex: REP-001" required />
        </label>
        <label class="field">
          <span>Cor da marca</span>
          <input id="partnerAccentInput" type="color" value="#14744b" required />
        </label>
        <label class="field">
          <span>E-mail de contato</span>
          <input id="partnerEmailInput" type="email" autocomplete="email" maxlength="160" />
        </label>
        <label class="field">
          <span>Telefone / WhatsApp</span>
          <input id="partnerPhoneInput" autocomplete="tel" maxlength="60" />
        </label>
        <label class="field">
          <span>Cidade</span>
          <input id="partnerCityInput" autocomplete="address-level2" maxlength="120" />
        </label>
        <label class="field">
          <span>UF</span>
          <input id="partnerStateInput" autocomplete="address-level1" maxlength="40" />
        </label>
      </div>
      <div class="modal-error" id="partnerOnboardingError" role="alert"></div>
      <div class="modal-actions">
        <button class="ghost-button" type="button" id="cancelPartnerOnboarding" hidden>Cancelar</button>
        <button class="primary-button" type="submit">Salvar representante</button>
      </div>
    </form>
  </div>
  <div class="modal-backdrop" id="representativeModal" hidden>
    <form class="modal" id="representativeForm">
      <h2>Representantes</h2>
      <p>Escolha qual representante está trabalhando agora. As empresas exibidas ficam vinculadas ao código escolhido.</p>
      <label class="field">
        <span>Representante ativo</span>
        <select id="representativeSelect">
          <option value="">Selecione um representante</option>
        </select>
      </label>
      <div class="delete-details" id="representativeDetails" hidden></div>
      <div class="modal-error" id="representativeError" role="alert"></div>
      <div class="modal-actions">
        <button class="ghost-button" type="button" id="cancelRepresentative">Cancelar</button>
        <button class="ghost-button" type="button" id="newRepresentative">Novo representante</button>
        <button class="primary-button" type="submit" id="useRepresentative" disabled>Usar representante</button>
      </div>
    </form>
  </div>
  <script>
    const grid = document.querySelector("#tenantGrid");
    const runbar = document.querySelector("#runbar");
    const statusText = document.querySelector("#statusText");
    const stopButton = document.querySelector("#stopServer");
    const newTenantButton = document.querySelector("#newTenant");
    const removeTenantModeButton = document.querySelector("#removeTenantMode");
    const switchRepresentativeButton = document.querySelector("#switchRepresentative");
    const modePanel = document.querySelector("#modePanel");
    const deleteModeNote = document.querySelector("#deleteModeNote");
    const tenantModal = document.querySelector("#tenantModal");
    const tenantForm = document.querySelector("#tenantForm");
    const tenantName = document.querySelector("#tenantName");
    const tenantCode = document.querySelector("#tenantCode");
    const modalError = document.querySelector("#modalError");
    const manageModal = document.querySelector("#manageModal");
    const deleteTenantForm = document.querySelector("#deleteTenantForm");
    const deleteTenantDetails = document.querySelector("#deleteTenantDetails");
    const deleteConfirmStep = document.querySelector("#deleteConfirmStep");
    const deleteConfirmLabel = document.querySelector("#deleteConfirmLabel");
    const deleteConfirmInput = document.querySelector("#deleteConfirmInput");
    const deleteModalError = document.querySelector("#deleteModalError");
    const confirmDeleteButton = document.querySelector("#confirmDelete");
    const partnerOnboardingModal = document.querySelector("#partnerOnboardingModal");
    const partnerOnboardingForm = document.querySelector("#partnerOnboardingForm");
    const partnerOnboardingTitle = document.querySelector("#partnerOnboardingTitle");
    const partnerOnboardingCopy = document.querySelector("#partnerOnboardingCopy");
    const partnerOnboardingError = document.querySelector("#partnerOnboardingError");
    const partnerNameInput = document.querySelector("#partnerNameInput");
    const partnerCodeInput = document.querySelector("#partnerCodeInput");
    const partnerAccentInput = document.querySelector("#partnerAccentInput");
    const partnerEmailInput = document.querySelector("#partnerEmailInput");
    const partnerPhoneInput = document.querySelector("#partnerPhoneInput");
    const partnerCityInput = document.querySelector("#partnerCityInput");
    const partnerStateInput = document.querySelector("#partnerStateInput");
    const cancelPartnerOnboardingButton = document.querySelector("#cancelPartnerOnboarding");
    const representativeModal = document.querySelector("#representativeModal");
    const representativeForm = document.querySelector("#representativeForm");
    const representativeSelect = document.querySelector("#representativeSelect");
    const representativeDetails = document.querySelector("#representativeDetails");
    const representativeError = document.querySelector("#representativeError");
    const newRepresentativeButton = document.querySelector("#newRepresentative");
    const useRepresentativeButton = document.querySelector("#useRepresentative");
    const tenantModalTitle = document.querySelector("#tenantModalTitle");
    const tenantModalCopy = document.querySelector("#tenantModalCopy");
    const tenantModalSubmit = document.querySelector("#tenantModalSubmit");
    const launcherKicker = document.querySelector("#launcherKicker");
    const launcherTitle = document.querySelector("#launcherTitle");
    const launcherSubtitle = document.querySelector("#launcherSubtitle");
    const partnerLogoBox = document.querySelector("#partnerLogoBox");
    const partnerLogo = document.querySelector("#partnerLogo");
    const chromeTitle = document.querySelector("#chromeTitle");
    const chromeSubtitle = document.querySelector("#chromeSubtitle");
    const chromeMode = document.querySelector("#chromeMode");
    const chromeLicense = document.querySelector("#chromeLicense");
    const chromeLogo = document.querySelector("#chromeLogo");
    const chromeInitials = document.querySelector("#chromeInitials");
    let launcherMode = "client";
    let currentPartner = {};
    let currentRepresentatives = [];
    let currentTenants = [];
    let deletePreparedTenant = null;
    let deleteModeActive = false;
    let autoStartAttempted = false;
    let partnerCodeTouched = false;
    let partnerOnboardingForced = false;

    function initials(name) {
      return (name || "P").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "P";
    }

    function normalizeCompanyCode(value) {
      return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 24);
    }

    function normalizePartnerCode(value) {
      return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40);
    }

    function esc(value) {
      return String(value || "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char]);
    }

    const accentReplacements = [
      [/\bIn\?cio\b/g, "Início"], [/\bin\?cio\b/g, "início"],
      [/\bImplanta\?\?o\b/g, "Implantação"], [/\bimplanta\?\?o\b/g, "implantação"],
      [/\bConfigura\?\?o\b/g, "Configuração"], [/\bconfigura\?\?o\b/g, "configuração"],
      [/\bInstala\?\?o\b/g, "Instalação"], [/\binstala\?\?o\b/g, "instalação"],
      [/\bOpera\?\?o\b/g, "Operação"], [/\bopera\?\?o\b/g, "operação"],
      [/\bUsu\?rio\b/g, "Usuário"], [/\busu\?rio\b/g, "usuário"],
      [/\bUsu\?rios\b/g, "Usuários"], [/\busu\?rios\b/g, "usuários"],
      [/\bLicen\?a\b/g, "Licença"], [/\blicen\?a\b/g, "licença"],
      [/\bGest\?o\b/g, "Gestão"], [/\bgest\?o\b/g, "gestão"],
      [/\bVis\?o\b/g, "Visão"], [/\bvis\?o\b/g, "visão"],
      [/\bEst\?\b/g, "Está"], [/\best\?\b/g, "está"],
      [/\bN\?o\b/g, "Não"], [/\bn\?o\b/g, "não"],
      [/\bposs\?vel\b/g, "possível"], [/\bPoss\?vel\b/g, "Possível"],
      [/\bInicio\b/g, "Início"], [/\binicio\b/g, "início"],
      [/\bImplantacao\b/g, "Implantação"], [/\bimplantacao\b/g, "implantação"],
      [/\bConfiguracao\b/g, "Configuração"], [/\bconfiguracao\b/g, "configuração"],
      [/\bInstalacao\b/g, "Instalação"], [/\binstalacao\b/g, "instalação"],
      [/\bOperacao\b/g, "Operação"], [/\boperacao\b/g, "operação"],
      [/\bUsuario\b/g, "Usuário"], [/\busuario\b/g, "usuário"],
      [/\bUsuarios\b/g, "Usuários"], [/\busuarios\b/g, "usuários"],
      [/\bLicenca\b/g, "Licença"], [/\blicenca\b/g, "licença"],
      [/\bGestao\b/g, "Gestão"], [/\bgestao\b/g, "gestão"],
      [/\bVisao\b/g, "Visão"], [/\bvisao\b/g, "visão"],
      [/\bPossivel\b/g, "Possível"], [/\bpossivel\b/g, "possível"],
      [/\bProxima\b/g, "Próxima"], [/\bproxima\b/g, "próxima"],
      [/\bEsta\b/g, "Está"], [/\besta\b/g, "está"],
      [/\bNao\b/g, "Não"], [/\bnao\b/g, "não"],
    ];

    function normalizeAccents(text) {
      return accentReplacements.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), String(text || ""));
    }

    function normalizeLauncherText(root = document.body) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          return parent && !parent.closest("script, style") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      });
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach((node) => {
        const normalized = normalizeAccents(node.nodeValue);
        if (normalized !== node.nodeValue) node.nodeValue = normalized;
      });
      root.querySelectorAll("[title], [aria-label], [placeholder]").forEach((node) => {
        ["title", "aria-label", "placeholder"].forEach((attr) => {
          const current = node.getAttribute(attr);
          if (!current) return;
          const normalized = normalizeAccents(current);
          if (normalized !== current) node.setAttribute(attr, normalized);
        });
      });
    }

    async function api(path, options = {}) {
      const response = await fetch(path, {
        headers: { "content-type": "application/json" },
        ...options,
      });
      const payload = await response.json();
      if (!response.ok || payload.ok === false) throw new Error(payload.error || "Falha no iniciador.");
      return payload;
    }

    function launcherCopy(mode, partner) {
      const name = (partner && partner.name || "").trim();
      if (mode === "partner") {
        return {
          modeLabel: "Representante",
          kicker: name ? "Área do representante" : "Representante",
          title: name || "Clientes",
          subtitle: "Prepare novas empresas, abra implantações locais e acompanhe os clientes vinculados a este pacote.",
          newLabel: "Nova empresa",
          empty: "Nenhuma empresa vinculada a este representante. Clique em Nova empresa para começar uma implantação.",
          button: "Abrir cliente",
          modalTitle: "Nova empresa cliente",
          modalCopy: "Informe o nome da empresa cliente. Depois disso, a implantação local abre para configuração inicial.",
          modalSubmit: "Criar cliente",
          panel: "",
        };
      }
      if (mode === "platform") {
        return {
          modeLabel: "Gestão",
          kicker: "Gestão da plataforma",
          title: "Clientes locais",
          subtitle: "Esta entrada é para sua visão administrativa. O portal central de assinaturas será separado desta instalação local.",
          newLabel: "Nova empresa local",
          empty: "Nenhuma empresa local encontrada.",
          button: "Abrir empresa",
          modalTitle: "Nova empresa local",
          modalCopy: "Informe o nome da empresa para criar uma instalação local administrável.",
          modalSubmit: "Criar empresa",
          panel: "Portal central futuro: aqui entram parceiros, clientes ativos, licenças, pacotes, versões e cobrança. Por enquanto esta tela abre apenas instalações locais.",
        };
      }
      return {
        modeLabel: "Cliente",
        kicker: name ? "Implantação acompanhada por" : "Implantação guiada",
        title: name || "Primeiro acesso",
        subtitle: "Comece pela empresa, crie o acesso inicial e siga para a primeira importação assistida.",
        newLabel: "Começar implantação",
        empty: "Nenhuma implantação encontrada. Comece criando a empresa que vai usar o sistema.",
        button: "Continuar implantação",
        modalTitle: "Começar implantação",
        modalCopy: "Informe o nome da empresa. Depois disso, você será guiado por acesso, documentos e primeira importação.",
        modalSubmit: "Começar",
        panel: "",
      };
    }

    function tenantActionLabel(tenant, copy) {
      if (launcherMode !== "client") return copy.button;
      const userSummary = String(tenant.user_summary || "").toLowerCase();
      const profileStatus = String(tenant.profile_status || "").toLowerCase();
      const pending = userSummary.includes("pendente")
        || userSummary.includes("nenhum")
        || profileStatus.includes("aguardando")
        || profileStatus.includes("pendente")
        || profileStatus.includes("incompleta");
      return pending ? "Continuar implantação" : "Entrar na operação";
    }

    function renderTenants(tenants) {
      const copy = launcherCopy(launcherMode, currentPartner);
      grid.innerHTML = "";
      if (!tenants.length) {
        grid.innerHTML = `<div class="empty">${esc(copy.empty)}</div>`;
        return;
      }
      tenants.forEach((tenant) => {
        const card = document.createElement("article");
        card.className = deleteModeActive ? "card delete-mode" : "card";
        card.tabIndex = 0;
        card.setAttribute("role", "button");
        card.setAttribute(
          "aria-label",
          deleteModeActive ? `Remover ${tenant.name}` : `Abrir ${tenant.name}`
        );
        card.innerHTML = `
          <div class="card-top">
            <div class="logo">${tenant.logo_data_url ? `<img src="${tenant.logo_data_url}" alt="">` : `<span class="initials">${esc(initials(tenant.name))}</span>`}</div>
            <div class="card-title">
              <h2 title="${esc(tenant.name)}">${esc(tenant.name)}</h2>
              <span class="company-code" title="Código da empresa">#${esc(tenant.company_code || tenant.id)}</span>
            </div>
          </div>
          <div class="company-info">
            <div class="user-count">${esc(tenant.user_summary || "Usuários pendentes")}</div>
            ${tenant.address ? `<div class="address">${esc(tenant.address)}</div>` : `<div class="pending">${esc(tenant.profile_status || "Dados da empresa pendentes")}</div>`}
          </div>
          <div class="card-actions">
            ${
              deleteModeActive
                ? `<span class="delete-card-hint">Clique para remover</span>`
                : `<button class="primary-button tenant-open" type="button">${esc(tenantActionLabel(tenant, copy))}</button>`
            }
          </div>
        `;
        const openTenant = () => {
          if (deleteModeActive) {
            openManageModal(tenant);
          } else {
            startTenant(tenant.id, tenant.name);
          }
        };
        card.addEventListener("click", openTenant);
        card.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          openTenant();
        });
        card.querySelector(".tenant-open")?.addEventListener("click", (event) => {
          event.stopPropagation();
          startTenant(tenant.id, tenant.name);
        });
        grid.appendChild(card);
      });
    }

    function renderLauncherHeader(partner) {
      const copy = launcherCopy(launcherMode, partner);
      const name = (partner && partner.name || "").trim();
      const displayName = name || copy.title;
      launcherKicker.textContent = copy.kicker;
      launcherTitle.textContent = copy.title;
      launcherSubtitle.textContent = copy.subtitle;
      newTenantButton.textContent = copy.newLabel;
      tenantModalTitle.textContent = copy.modalTitle;
      tenantModalCopy.textContent = copy.modalCopy;
      tenantModalSubmit.textContent = copy.modalSubmit;
      modePanel.hidden = !copy.panel;
      modePanel.innerHTML = copy.panel ? `<span>Próxima camada</span><strong>Gestão central ainda não está dentro do instalador local</strong><p>${esc(copy.panel)}</p>` : "";
      chromeTitle.textContent = displayName;
      chromeSubtitle.textContent = launcherMode === "platform" ? "Administração local" : "Ambiente local seguro";
      chromeMode.textContent = copy.modeLabel;
      chromeLicense.textContent = partner && partner.license_plan ? `Plano ${partner.license_plan}` : "Licença local";
      if (partner && partner.logo_data_url) {
        partnerLogo.src = partner.logo_data_url;
        partnerLogo.alt = name || copy.title;
        partnerLogoBox.hidden = false;
        chromeLogo.src = partner.logo_data_url;
        chromeLogo.alt = displayName;
        chromeLogo.hidden = false;
        chromeInitials.hidden = true;
      } else {
        partnerLogo.removeAttribute("src");
        partnerLogo.alt = "";
        partnerLogoBox.hidden = true;
        chromeLogo.removeAttribute("src");
        chromeLogo.alt = "";
        chromeLogo.hidden = true;
        chromeInitials.hidden = false;
        chromeInitials.textContent = initials(displayName);
      }
      if (partner && partner.accent_color) {
        document.documentElement.style.setProperty("--green", partner.accent_color);
      }
    }

    async function loadTenants() {
      const payload = await api("/api/tenants");
      launcherMode = payload.mode || "client";
      currentPartner = payload.partner || {};
      currentRepresentatives = payload.representatives || [];
      currentTenants = payload.tenants || [];
      renderLauncherHeader(currentPartner);
      renderTenants(currentTenants);
      renderRepresentativeOptions();
      renderPartnerOnboarding();
      const manualSelection = new URLSearchParams(window.location.search).get("select") === "1";
      if (!autoStartAttempted && payload.auto_start && payload.last_tenant && !manualSelection) {
        autoStartAttempted = true;
        const tenant = currentTenants.find((item) => item.id === payload.last_tenant);
        if (tenant) startTenant(tenant.id, tenant.name);
      }
    }

    function renderPartnerOnboarding() {
      const required = launcherMode === "partner" && currentPartner.onboarding_required;
      const visible = required || partnerOnboardingForced;
      partnerOnboardingTitle.textContent = required ? "Primeiro acesso do representante" : "Novo representante";
      partnerOnboardingCopy.textContent = required
        ? "Configure como esse pacote vai identificar você ao preparar e acompanhar empresas cliente."
        : "Cadastre outro representante para separar carteira, empresas e implantações por código.";
      cancelPartnerOnboardingButton.hidden = required;
      partnerOnboardingModal.hidden = !visible;
      if (!visible) return;
      if (partnerOnboardingForced) {
        partnerNameInput.value = "";
        partnerCodeInput.value = "";
        partnerAccentInput.value = currentPartner.accent_color || "#14744b";
        partnerEmailInput.value = "";
        partnerPhoneInput.value = "";
        partnerCityInput.value = "";
        partnerStateInput.value = "";
      } else {
        partnerNameInput.value = currentPartner.name || "";
        partnerCodeInput.value = normalizePartnerCode(currentPartner.id || "");
        partnerAccentInput.value = currentPartner.accent_color || "#14744b";
        partnerEmailInput.value = currentPartner.email || "";
        partnerPhoneInput.value = currentPartner.phone || "";
        partnerCityInput.value = currentPartner.city || "";
        partnerStateInput.value = currentPartner.state || "";
      }
      partnerCodeTouched = false;
      partnerOnboardingError.textContent = "";
      setTimeout(() => partnerNameInput.focus(), 0);
    }

    function selectedRepresentative() {
      return currentRepresentatives.find((rep) => rep.id === representativeSelect.value) || null;
    }

    function renderRepresentativeOptions() {
      switchRepresentativeButton.hidden = launcherMode !== "partner";
      const selected = representativeSelect.value || currentPartner.id || "";
      representativeSelect.innerHTML = `<option value="">Selecione um representante</option>`;
      currentRepresentatives.forEach((rep) => {
        const option = document.createElement("option");
        option.value = rep.id;
        option.textContent = `${rep.name || rep.id} (#${rep.id})`;
        representativeSelect.appendChild(option);
      });
      if (selected && currentRepresentatives.some((rep) => rep.id === selected)) {
        representativeSelect.value = selected;
      }
      renderRepresentativeDetails();
    }

    function renderRepresentativeDetails() {
      const rep = selectedRepresentative();
      useRepresentativeButton.disabled = !rep || rep.id === currentPartner.id;
      representativeError.textContent = "";
      if (!rep) {
        representativeDetails.hidden = true;
        representativeDetails.innerHTML = "";
        return;
      }
      representativeDetails.hidden = false;
      representativeDetails.innerHTML = `
        <strong>${esc(rep.name || rep.id)}</strong>
        <span>Código: #${esc(rep.id)}</span>
        <span>Empresas vinculadas: ${esc(String(rep.tenant_count || 0))}</span>
        <span>${esc([rep.city, rep.state].filter(Boolean).join(" / ") || rep.email || rep.phone || "Contato não informado")}</span>
      `;
    }

    function openRepresentativeModal() {
      renderRepresentativeOptions();
      representativeModal.hidden = false;
      representativeSelect.focus();
    }

    function closeRepresentativeModal() {
      representativeModal.hidden = true;
    }

    function openNewRepresentativeOnboarding() {
      closeRepresentativeModal();
      partnerOnboardingForced = true;
      renderPartnerOnboarding();
    }

    function closePartnerOnboarding() {
      partnerOnboardingForced = false;
      renderPartnerOnboarding();
    }

    async function selectRepresentative(event) {
      event.preventDefault();
      const rep = selectedRepresentative();
      if (!rep) return;
      try {
        const payload = await api("/api/partner/select", {
          method: "POST",
          body: JSON.stringify({ id: rep.id }),
        });
        currentPartner = payload.partner || currentPartner;
        closeRepresentativeModal();
        await loadTenants();
      } catch (error) {
        representativeError.textContent = normalizeAccents(error.message || "Não foi possível trocar representante.");
      }
    }

    async function savePartnerOnboarding(event) {
      event.preventDefault();
      const name = partnerNameInput.value.trim();
      const code = normalizePartnerCode(partnerCodeInput.value || name);
      if (!name) {
        partnerOnboardingError.textContent = "Informe o nome do representante.";
        return;
      }
      if (!code) {
        partnerOnboardingError.textContent = "Informe o código do representante.";
        return;
      }
      partnerOnboardingError.textContent = "";
      try {
        const payload = await api("/api/partner/onboarding", {
          method: "POST",
          body: JSON.stringify({
            name,
            code,
            accent_color: partnerAccentInput.value,
            email: partnerEmailInput.value,
            phone: partnerPhoneInput.value,
            city: partnerCityInput.value,
            state: partnerStateInput.value,
          }),
        });
        currentPartner = payload.partner || currentPartner;
        partnerOnboardingForced = false;
        partnerOnboardingModal.hidden = true;
        await loadTenants();
      } catch (error) {
        partnerOnboardingError.textContent = normalizeAccents(error.message || "Não foi possível salvar o representante.");
      }
    }

    async function startTenant(id, name) {
      runbar.hidden = false;
      statusText.textContent = `Abrindo ${name} nesta janela...`;
      stopButton.disabled = true;
      try {
        const payload = await api("/api/start", { method: "POST", body: JSON.stringify({ tenant: id }) });
        statusText.textContent = `${name} está abrindo em ${payload.url || "porta local"}...`;
        stopButton.disabled = false;
        if (payload.url) {
          window.location.assign(payload.url);
        }
      } catch (error) {
        statusText.textContent = normalizeAccents(error.message || "Não foi possível abrir o sistema.");
      }
    }

    function openTenantModal() {
      modalError.textContent = "";
      tenantName.value = "";
      tenantCode.value = "";
      tenantCode.dataset.touched = "";
      tenantModal.hidden = false;
      tenantName.focus();
    }

    function closeTenantModal() {
      tenantModal.hidden = true;
    }

    async function createTenant(event) {
      event.preventDefault();
      const name = tenantName.value.trim();
      const code = normalizeCompanyCode(tenantCode.value || name);
      if (!name) {
        modalError.textContent = "Informe o nome da empresa.";
        return;
      }
      if (!code) {
        modalError.textContent = "Informe o código da empresa.";
        return;
      }
      modalError.textContent = "";
      const payload = await api("/api/create", { method: "POST", body: JSON.stringify({ name, code }) });
      closeTenantModal();
      await loadTenants();
      await startTenant(payload.tenant, payload.name);
    }

    function setDeleteMode(active) {
      deleteModeActive = active;
      deleteModeNote.hidden = !active;
      removeTenantModeButton.textContent = active ? "Cancelar remoção" : "Remover empresa";
      removeTenantModeButton.setAttribute("aria-pressed", active ? "true" : "false");
      renderTenants(currentTenants);
    }

    function renderDeleteDetails(tenant) {
      deletePreparedTenant = tenant || null;
      deleteConfirmStep.hidden = !tenant;
      confirmDeleteButton.disabled = true;
      deleteConfirmInput.value = "";
      deleteModalError.textContent = "";
      if (!tenant) {
        deleteTenantDetails.hidden = true;
        deleteTenantDetails.innerHTML = "";
        return;
      }
      const addressOrStatus = tenant.address || tenant.profile_status || "Dados da empresa pendentes";
      deleteTenantDetails.hidden = false;
      deleteTenantDetails.innerHTML = `
        <strong>${esc(tenant.name)}</strong>
        <span>Código: #${esc(tenant.company_code || tenant.id)}</span>
        <span>Usuários: ${esc(tenant.user_summary || "Usuários pendentes")}</span>
        <span>${esc(addressOrStatus)}</span>
      `;
      deleteConfirmLabel.textContent = `Digite ${tenant.company_code || tenant.id}`;
      updateDeleteConfirmationState();
    }

    function openManageModal(tenant) {
      renderDeleteDetails(tenant);
      manageModal.hidden = false;
      deleteConfirmInput.focus();
    }

    function closeManageModal() {
      manageModal.hidden = true;
    }

    function updateDeleteConfirmationState() {
      const expected = normalizeCompanyCode(deletePreparedTenant?.company_code || deletePreparedTenant?.id || "");
      const typed = normalizeCompanyCode(deleteConfirmInput.value);
      confirmDeleteButton.disabled = !expected || typed !== expected;
    }

    async function deleteTenant(event) {
      event.preventDefault();
      const tenant = deletePreparedTenant;
      if (!tenant || confirmDeleteButton.disabled) return;
      try {
        await api("/api/delete", {
          method: "POST",
          body: JSON.stringify({
            tenant: tenant.id,
            company_code: tenant.company_code || "",
            name: tenant.name || "",
          }),
        });
        closeManageModal();
        setDeleteMode(false);
        await loadTenants();
        statusText.textContent = `Empresa "${tenant.name}" excluída.`;
      } catch (error) {
        deleteModalError.textContent = normalizeAccents(error.message || "Não foi possível excluir a empresa.");
        return;
      }
      runbar.hidden = false;
    }

    async function stopServer() {
      await api("/api/stop", { method: "POST", body: "{}" });
      statusText.textContent = "";
      runbar.hidden = true;
      stopButton.disabled = true;
    }

    document.querySelector("#newTenant").addEventListener("click", openTenantModal);
    removeTenantModeButton.addEventListener("click", () => setDeleteMode(!deleteModeActive));
    switchRepresentativeButton.addEventListener("click", openRepresentativeModal);
    document.querySelector("#cancelTenant").addEventListener("click", closeTenantModal);
    document.querySelector("#cancelManage").addEventListener("click", closeManageModal);
    document.querySelector("#cancelRepresentative").addEventListener("click", closeRepresentativeModal);
    cancelPartnerOnboardingButton.addEventListener("click", closePartnerOnboarding);
    newRepresentativeButton.addEventListener("click", openNewRepresentativeOnboarding);
    representativeSelect.addEventListener("change", renderRepresentativeDetails);
    representativeForm.addEventListener("submit", selectRepresentative);
    tenantName.addEventListener("input", () => {
      if (tenantCode.dataset.touched) return;
      tenantCode.value = normalizeCompanyCode(tenantName.value);
    });
    tenantCode.addEventListener("input", () => {
      tenantCode.dataset.touched = "true";
      tenantCode.value = normalizeCompanyCode(tenantCode.value);
    });
    partnerNameInput.addEventListener("input", () => {
      if (partnerCodeTouched) return;
      partnerCodeInput.value = normalizePartnerCode(partnerNameInput.value);
    });
    partnerCodeInput.addEventListener("input", () => {
      partnerCodeTouched = true;
      partnerCodeInput.value = normalizePartnerCode(partnerCodeInput.value);
    });
    partnerOnboardingForm.addEventListener("submit", savePartnerOnboarding);
    tenantModal.addEventListener("click", (event) => {
      if (event.target === tenantModal) closeTenantModal();
    });
    manageModal.addEventListener("click", (event) => {
      if (event.target === manageModal) closeManageModal();
    });
    deleteConfirmInput.addEventListener("input", updateDeleteConfirmationState);
    deleteTenantForm.addEventListener("submit", deleteTenant);
    tenantForm.addEventListener("submit", (event) => {
      createTenant(event).catch((error) => {
        modalError.textContent = error.message;
      });
    });
    stopButton.addEventListener("click", stopServer);
    loadTenants().catch((error) => {
      statusText.textContent = normalizeAccents(error.message);
    });
    normalizeLauncherText();
    new MutationObserver(() => normalizeLauncherText()).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["title", "aria-label", "placeholder"]
    });
  </script>
</body>
</html>"""


class LauncherState:
    process: subprocess.Popen | None = None
    current_url = ""
    log_path = ""
    current_tenant = ""


def browser_app_executable() -> str:
    for command in ("msedge", "msedge.exe", "chrome", "chrome.exe"):
        resolved = shutil.which(command)
        if resolved:
            return resolved
    for raw_path in (
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    ):
        path = Path(raw_path)
        if path.exists():
            return str(path)
    return ""


def window_profile_dir(name: str) -> Path:
    slug = slugify(name) or "app"
    path = WINDOW_PROFILES_DIR / slug
    path.mkdir(parents=True, exist_ok=True)
    return path


def maximized_startupinfo() -> subprocess.STARTUPINFO | None:
    if os.name != "nt":
        return None
    startupinfo = subprocess.STARTUPINFO()
    startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    startupinfo.wShowWindow = 3
    return startupinfo


def maximize_process_windows(pid: int) -> None:
    if os.name != "nt" or not pid:
        return
    user32 = ctypes.windll.user32
    target_pid = ctypes.c_ulong()

    def enum_window(hwnd: int, _: int) -> bool:
        if not user32.IsWindowVisible(hwnd):
            return True
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(target_pid))
        if target_pid.value == pid:
            user32.ShowWindow(hwnd, 3)
        return True

    enum_proc = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_int, ctypes.c_int)(enum_window)
    for _ in range(12):
        user32.EnumWindows(enum_proc, 0)
        time.sleep(0.15)


def open_app_window(url: str, profile: str = "app") -> bool:
    executable = browser_app_executable()
    if not executable:
        webbrowser.open(url)
        return False
    profile_dir = window_profile_dir(profile)
    process = subprocess.Popen(
        [
            executable,
            f"--app={url}",
            "--new-window",
            "--no-first-run",
            "--disable-features=Translate,AutofillServerCommunication",
            "--disable-sync",
            f"--user-data-dir={profile_dir}",
            "--start-maximized",
            "--window-size=1280,860",
        ],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        startupinfo=maximized_startupinfo(),
    )
    threading.Thread(target=maximize_process_windows, args=(process.pid,), name="pulso-window-maximize", daemon=True).start()
    return True


def json_response(handler: BaseHTTPRequestHandler, payload: dict, status: int = 200) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def html_response(handler: BaseHTTPRequestHandler, html: str) -> None:
    body = html.encode("utf-8")
    handler.send_response(200)
    handler.send_header("Content-Type", "text/html; charset=utf-8")
    handler.send_header("Content-Language", "pt-BR")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def read_request_json(handler: BaseHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length") or 0)
    if not length:
        return {}
    return json.loads(handler.rfile.read(length).decode("utf-8"))


def base_partner_config() -> dict:
    config = read_json(PARTNER_CONFIG_PATH)
    partner = config.get("partner") if isinstance(config.get("partner"), dict) else {}
    contact = config.get("contact") if isinstance(config.get("contact"), dict) else {}
    license_info = config.get("license") if isinstance(config.get("license"), dict) else {}
    distribution = config.get("distribution") if isinstance(config.get("distribution"), dict) else {}
    return {
        "schema": "platform.partner.v1",
        "partner": {
            "id": slugify(str(partner.get("id") or "")) or "default",
            "name": str(partner.get("name") or "").strip(),
            "logo_path": str(partner.get("logo_path") or "").strip(),
            "accent_color": str(partner.get("accent_color") or "").strip() or "#14744b",
        },
        "contact": {
            "email": str(contact.get("email") or "").strip(),
            "phone": str(contact.get("phone") or "").strip(),
            "city": str(contact.get("city") or "").strip(),
            "state": str(contact.get("state") or "").strip(),
        },
        "license": {
            "status": str(license_info.get("status") or "local").strip() or "local",
            "plan": str(license_info.get("plan") or "sem_assinatura").strip() or "sem_assinatura",
            "activation_url": str(license_info.get("activation_url") or "").strip(),
            "offline_grace_days": int(license_info.get("offline_grace_days") or 7),
            "billing_model": str(license_info.get("billing_model") or "per_active_client").strip(),
        },
        "distribution": {
            "package_id": str(distribution.get("package_id") or "local_default").strip() or "local_default",
            "channel": str(distribution.get("channel") or "manual").strip() or "manual",
            "activation_mode": str(distribution.get("activation_mode") or "per_client_activation").strip() or "per_client_activation",
        },
    }


def representative_from_config(config: dict) -> dict:
    partner = config.get("partner") if isinstance(config.get("partner"), dict) else {}
    contact = config.get("contact") if isinstance(config.get("contact"), dict) else {}
    license_info = config.get("license") if isinstance(config.get("license"), dict) else {}
    distribution = config.get("distribution") if isinstance(config.get("distribution"), dict) else {}
    partner_id = slugify(str(partner.get("id") or "")) or "default"
    return {
        "id": partner_id,
        "name": str(partner.get("name") or "").strip(),
        "logo_path": str(partner.get("logo_path") or "").strip(),
        "accent_color": normalize_hex_color(str(partner.get("accent_color") or "#14744b")),
        "contact": {
            "email": str(contact.get("email") or "").strip(),
            "phone": str(contact.get("phone") or "").strip(),
            "city": str(contact.get("city") or "").strip(),
            "state": str(contact.get("state") or "").strip(),
        },
        "license": {
            "status": str(license_info.get("status") or "local").strip() or "local",
            "plan": str(license_info.get("plan") or "sem_assinatura").strip() or "sem_assinatura",
            "activation_url": str(license_info.get("activation_url") or "").strip(),
            "offline_grace_days": int(license_info.get("offline_grace_days") or 7),
            "billing_model": str(license_info.get("billing_model") or "per_active_client").strip(),
        },
        "distribution": {
            "package_id": str(distribution.get("package_id") or "local_default").strip() or "local_default",
            "channel": str(distribution.get("channel") or "manual").strip() or "manual",
            "activation_mode": str(distribution.get("activation_mode") or "per_client_activation").strip() or "per_client_activation",
        },
    }


def config_from_representative(rep: dict) -> dict:
    return {
        "schema": "platform.partner.v1",
        "partner": {
            "id": slugify(str(rep.get("id") or "")) or "default",
            "name": str(rep.get("name") or "").strip(),
            "logo_path": str(rep.get("logo_path") or "").strip(),
            "accent_color": normalize_hex_color(str(rep.get("accent_color") or "#14744b")),
        },
        "contact": rep.get("contact") if isinstance(rep.get("contact"), dict) else {},
        "license": rep.get("license") if isinstance(rep.get("license"), dict) else {},
        "distribution": rep.get("distribution") if isinstance(rep.get("distribution"), dict) else {},
    }


def normalized_representative(raw: dict, fallback: dict) -> dict:
    raw_config = {
        "partner": {
            "id": raw.get("id"),
            "name": raw.get("name"),
            "logo_path": raw.get("logo_path"),
            "accent_color": raw.get("accent_color"),
        },
        "contact": raw.get("contact") if isinstance(raw.get("contact"), dict) else {},
        "license": raw.get("license") if isinstance(raw.get("license"), dict) else fallback.get("license", {}),
        "distribution": raw.get("distribution") if isinstance(raw.get("distribution"), dict) else fallback.get("distribution", {}),
    }
    rep = representative_from_config(raw_config)
    if not rep["license"]:
        rep["license"] = fallback.get("license", {})
    if not rep["distribution"]:
        rep["distribution"] = fallback.get("distribution", {})
    return rep


def representatives_state() -> dict:
    fallback = representative_from_config(base_partner_config())
    payload = read_json(REPRESENTATIVES_CONFIG_PATH)
    raw_reps = payload.get("representatives") if isinstance(payload.get("representatives"), list) else []
    reps = []
    seen: set[str] = set()
    for item in raw_reps:
        if not isinstance(item, dict):
            continue
        rep = normalized_representative(item, fallback)
        if not rep["id"] or rep["id"] in seen:
            continue
        reps.append(rep)
        seen.add(rep["id"])
    if not reps and fallback["name"]:
        reps.append(fallback)
    active_id = slugify(str(payload.get("active_id") or "")) if payload else ""
    if active_id not in {rep["id"] for rep in reps}:
        active_id = reps[0]["id"] if reps else ""
    return {"schema": "platform.representatives.v1", "active_id": active_id, "representatives": reps}


def write_representatives_state(state: dict) -> None:
    REPRESENTATIVES_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPRESENTATIVES_CONFIG_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def active_representative_record() -> dict:
    state = representatives_state()
    active_id = state.get("active_id") or ""
    return next((rep for rep in state["representatives"] if rep["id"] == active_id), {})


def sync_default_partner_config(rep: dict) -> None:
    PARTNER_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    PARTNER_CONFIG_PATH.write_text(json.dumps(config_from_representative(rep), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def partner_config() -> dict:
    if LAUNCHER_MODE == "partner":
        rep = active_representative_record()
        if rep:
            return config_from_representative(rep)
    return base_partner_config()


def active_partner_id() -> str:
    return str(partner_config().get("partner", {}).get("id") or "default")


def all_local_tenants() -> list[str]:
    if not TENANTS_DIR.exists():
        return []
    return sorted(
        [
            path.name
            for path in TENANTS_DIR.iterdir()
            if path.is_dir() and not path.name.startswith(HIDDEN_TENANT_PREFIXES)
        ],
        key=lambda item: tenant_label(item).lower(),
    )


def normalize_hex_color(value: str) -> str:
    text = str(value or "").strip()
    if len(text) == 7 and text.startswith("#") and all(char in "0123456789abcdefABCDEF" for char in text[1:]):
        return text.lower()
    return "#14744b"


def public_logo_path(tenant: str) -> Path | None:
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
    return path if path.exists() else None


def public_asset_data_url(path: Path | None) -> str:
    if not path or not path.exists() or path.stat().st_size > 1_000_000:
        return ""
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    data = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{data}"


def logo_data_url(tenant: str) -> str:
    return public_asset_data_url(public_logo_path(tenant))


def partner_logo_path(logo_path: str) -> Path | None:
    parts = [part for part in logo_path.strip("/").split("/") if part]
    if len(parts) == 2 and parts[0] == "brand":
        path = ROOT / "web" / "brand" / Path(parts[1]).name
    elif len(parts) == 2 and parts[0] == "partner-assets":
        path = PARTNER_ASSETS_DIR / Path(parts[1]).name
    else:
        return None
    return path if path.exists() else None


def partner_payload() -> dict:
    config = partner_config()
    partner = config["partner"]
    contact = config["contact"]
    onboarding_required = LAUNCHER_MODE == "partner" and not representatives_state()["representatives"]
    return {
        "id": partner["id"],
        "name": partner["name"],
        "accent_color": partner["accent_color"],
        "email": contact["email"],
        "phone": contact["phone"],
        "city": contact["city"],
        "state": contact["state"],
        "onboarding_required": onboarding_required,
        "logo_data_url": public_asset_data_url(partner_logo_path(partner["logo_path"])),
        "license_status": config["license"]["status"],
        "license_plan": config["license"]["plan"],
        "billing_model": config["license"]["billing_model"],
        "activation_mode": config["distribution"]["activation_mode"],
        "package_id": config["distribution"]["package_id"],
    }


def representatives_payload() -> list[dict]:
    result = []
    tenants = all_local_tenants()
    for rep in representatives_state()["representatives"]:
        contact = rep.get("contact") if isinstance(rep.get("contact"), dict) else {}
        tenant_count = sum(1 for tenant in tenants if tenant_partner_id(tenant) == rep["id"])
        result.append(
            {
                "id": rep["id"],
                "name": rep["name"],
                "accent_color": rep["accent_color"],
                "email": str(contact.get("email") or ""),
                "phone": str(contact.get("phone") or ""),
                "city": str(contact.get("city") or ""),
                "state": str(contact.get("state") or ""),
                "tenant_count": tenant_count,
            }
        )
    return result


def save_partner_onboarding(payload: dict) -> dict:
    if LAUNCHER_MODE != "partner":
        raise ValueError("Onboarding de representante disponível apenas no modo representante.")
    current = partner_config()
    state = representatives_state()
    first_representative = not state["representatives"]
    previous_partner_id = current["partner"]["id"]
    name = str(payload.get("name") or "").strip()[:120]
    partner_id = slugify(str(payload.get("code") or name or ""))[:40]
    if not name:
        raise ValueError("Informe o nome do representante.")
    if not partner_id:
        raise ValueError("Informe o código do representante.")
    updated = representative_from_config({
        "partner": {
            "id": partner_id,
            "name": name,
            "logo_path": current["partner"].get("logo_path", ""),
            "accent_color": normalize_hex_color(str(payload.get("accent_color") or current["partner"]["accent_color"])),
        },
        "contact": {
            "email": str(payload.get("email") or "").strip()[:160],
            "phone": str(payload.get("phone") or "").strip()[:60],
            "city": str(payload.get("city") or "").strip()[:120],
            "state": str(payload.get("state") or "").strip()[:40],
        },
        "license": current["license"],
        "distribution": current["distribution"],
    })
    reps = [rep for rep in state["representatives"] if rep["id"] != partner_id]
    reps.append(updated)
    state = {
        "schema": "platform.representatives.v1",
        "active_id": partner_id,
        "representatives": sorted(reps, key=lambda rep: (rep.get("name") or rep.get("id") or "").lower()),
    }
    if first_representative:
        reassign_tenants_partner(previous_partner_id, partner_id)
    write_representatives_state(state)
    sync_default_partner_config(updated)
    return partner_payload()


def select_partner(payload: dict) -> dict:
    if LAUNCHER_MODE != "partner":
        raise ValueError("Seleção de representante disponível apenas no modo representante.")
    partner_id = slugify(str(payload.get("id") or ""))
    state = representatives_state()
    rep = next((item for item in state["representatives"] if item["id"] == partner_id), None)
    if not rep:
        raise ValueError("Representante não encontrado.")
    state["active_id"] = partner_id
    write_representatives_state(state)
    sync_default_partner_config(rep)
    return partner_payload()


def tenant_partner_id(tenant: str) -> str:
    config = read_json(TENANTS_DIR / tenant / "app_config.json")
    partner = config.get("partner") if isinstance(config.get("partner"), dict) else {}
    return slugify(str(partner.get("id") or "")) or "default"


def reassign_tenants_partner(old_id: str, new_id: str) -> None:
    old_id = slugify(old_id)
    new_id = slugify(new_id)
    if not old_id or not new_id or old_id == new_id:
        return
    for tenant in all_local_tenants():
        if tenant_partner_id(tenant) != old_id:
            continue
        config_path = TENANTS_DIR / tenant / "app_config.json"
        config = read_json(config_path)
        partner = config.get("partner") if isinstance(config.get("partner"), dict) else {}
        config["partner"] = {**partner, "id": new_id}
        config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def normalize_company_code(value: str) -> str:
    text = unicodedata.normalize("NFD", value.strip())
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    cleaned = "".join(char.upper() if char.isalnum() else "-" for char in text)
    return "-".join(part for part in cleaned.split("-") if part)[:24]


def tenant_company_code(tenant: str) -> str:
    config = read_json(TENANTS_DIR / tenant / "app_config.json")
    public = config.get("public") if isinstance(config.get("public"), dict) else {}
    defaults = config.get("defaults") if isinstance(config.get("defaults"), dict) else {}
    code = normalize_company_code(str(public.get("company_code") or defaults.get("company_code") or ""))
    return code or normalize_company_code(tenant.replace("_", "-")) or tenant.upper()


def company_code_exists(code: str) -> bool:
    normalized = normalize_company_code(code)
    if not normalized:
        return False
    partner_id = active_partner_id()
    for tenant in all_local_tenants():
        if tenant_partner_id(tenant) == partner_id and tenant_company_code(tenant) == normalized:
            return True
    return False


def resolve_tenant_identifier(*values: str) -> str:
    raw_values = [str(value or "").strip() for value in values if str(value or "").strip()]
    direct_matches: list[str] = []
    for value in raw_values:
        candidate = slugify(value)
        if candidate and not candidate.startswith(HIDDEN_TENANT_PREFIXES) and (TENANTS_DIR / candidate).is_dir():
            direct_matches.append(candidate)
    if direct_matches:
        return direct_matches[0]

    matches: list[str] = []
    active_partner = active_partner_id()
    for tenant in all_local_tenants():
        if tenant.startswith(HIDDEN_TENANT_PREFIXES):
            continue
        tenant_code = tenant_company_code(tenant)
        tenant_name = tenant_label(tenant)
        tenant_keys = {
            tenant,
            slugify(tenant_code),
            slugify(tenant_name),
            normalize_company_code(tenant_code),
            normalize_company_code(tenant_name),
        }
        for value in raw_values:
            value_keys = {slugify(value), normalize_company_code(value)}
            if tenant_keys & value_keys:
                matches.append(tenant)
                break

    if not matches:
        return slugify(raw_values[0]) if raw_values else ""
    partner_matches = [tenant for tenant in matches if tenant_partner_id(tenant) == active_partner]
    if len(partner_matches) == 1:
        return partner_matches[0]
    if len(matches) == 1:
        return matches[0]
    return slugify(raw_values[0])


def _tenant_db_path(tenant: str) -> Path:
    return TENANTS_DIR / tenant / "database.sqlite3"


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table,),
    ).fetchone()
    return bool(row)


def _count_rows(conn: sqlite3.Connection, table: str, where: str = "") -> int:
    if not _table_exists(conn, table):
        return 0
    query = f"SELECT COUNT(*) AS total FROM {table}"
    if where:
        query += f" WHERE {where}"
    return int(conn.execute(query).fetchone()["total"] or 0)


def _plural(value: int, singular: str, plural: str) -> str:
    return f"{value} {singular if value == 1 else plural}"


def _company_address(conn: sqlite3.Connection) -> str:
    if not _table_exists(conn, "organization_profiles"):
        return ""
    row = conn.execute(
        """
        SELECT address_line, address_number, district, city, state
        FROM organization_profiles
        WHERE COALESCE(address_line, '') <> ''
           OR COALESCE(city, '') <> ''
           OR COALESCE(state, '') <> ''
        LIMIT 1
        """
    ).fetchone()
    if not row:
        return ""
    street = " ".join(part for part in (row["address_line"], row["address_number"]) if part)
    city = " / ".join(part for part in (row["city"], row["state"]) if part)
    parts = [part for part in (street, row["district"], city) if part]
    return " - ".join(parts)


def tenant_card_details(tenant: str) -> dict:
    db_path = _tenant_db_path(tenant)
    if not db_path.exists():
        return {
            "user_summary": "Usuários pendentes",
            "address": "",
            "profile_status": "Aguardando onboarding",
        }
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        try:
            users = _count_rows(conn, "app_users")
            address = _company_address(conn)
        finally:
            conn.close()
    except sqlite3.Error:
        return {
            "user_summary": "Usuários pendentes",
            "address": "",
            "profile_status": "Configuração incompleta",
        }

    return {
        "user_summary": "Nenhum usuário" if users == 0 else _plural(users, "usuário", "usuários"),
        "address": address,
        "profile_status": "" if address else "Dados da empresa pendentes",
    }


def tenant_payloads() -> list[dict]:
    partner_id = active_partner_id()
    tenants = [tenant for tenant in all_local_tenants() if tenant_partner_id(tenant) == partner_id]
    result = []
    for tenant in tenants:
        details = tenant_card_details(tenant)
        result.append(
            {
                "id": tenant,
                "name": tenant_label(tenant),
                "company_code": tenant_company_code(tenant),
                "partner_id": partner_id,
                "note": "",
                "logo_data_url": logo_data_url(tenant),
                **details,
            }
        )
    return result


def valid_last_client_tenant() -> str:
    if LAUNCHER_MODE != "client":
        return ""
    tenant = read_last_client_tenant()
    if (
        not tenant
        or tenant.startswith(HIDDEN_TENANT_PREFIXES)
        or not (TENANTS_DIR / tenant).is_dir()
        or tenant_partner_id(tenant) != active_partner_id()
    ):
        if tenant:
            clear_client_tenant(tenant)
        return ""
    return tenant


def stop_app_server() -> None:
    if LauncherState.process and LauncherState.process.poll() is None:
        LauncherState.process.terminate()
        try:
            LauncherState.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            LauncherState.process.kill()
    LauncherState.process = None
    LauncherState.current_url = ""
    LauncherState.log_path = ""
    LauncherState.current_tenant = ""


def start_app_server(tenant: str) -> tuple[str, int, Path]:
    port = choose_port(APP_START_PORT, HOST)
    url = f"http://{HOST}:{port}"
    process, log_path = start_app_process(tenant, HOST, port)
    LauncherState.process = process
    LauncherState.current_url = url
    LauncherState.log_path = str(log_path)
    LauncherState.current_tenant = tenant
    try:
        wait_for_http_ready(url, process, log_path)
    except RuntimeError:
        stop_app_server()
        raise
    if LAUNCHER_MODE == "client":
        remember_client_tenant(tenant)
    return url, port, log_path


def create_tenant(name: str, code: str = "") -> str:
    if not name.strip():
        raise ValueError("Informe o nome da empresa.")
    code = normalize_company_code(code or name)
    if not code:
        raise ValueError("Código da empresa inválido.")
    if company_code_exists(code):
        raise ValueError("Já existe uma empresa com esse código.")
    base = slugify(code) or slugify(name)
    if not base:
        raise ValueError("Nome inválido.")
    tenant = base
    counter = 2
    while (TENANTS_DIR / tenant).exists():
        tenant = f"{base}_{counter}"
        counter += 1
    tenant_dir = TENANTS_DIR / tenant
    tenant_dir.mkdir(parents=True, exist_ok=True)
    (tenant_dir / "assets").mkdir(parents=True, exist_ok=True)
    config = {
        "schema": "pulso.white_label.v1",
        "partner": {"id": active_partner_id()},
        "public": {"app_name": name.strip(), "app_subtitle": "", "logo_path": "", "company_code": code},
        "defaults": {"company_name": name.strip(), "company_code": code, "imported_company_name": name.strip(), "store_name": name.strip(), "country": "Brasil"},
    }
    (tenant_dir / "app_config.json").write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return tenant


def delete_tenant(tenant: str, company_code: str = "", name: str = "") -> None:
    tenant = resolve_tenant_identifier(tenant, company_code, name)
    if not tenant or tenant.startswith(HIDDEN_TENANT_PREFIXES):
        raise ValueError("Empresa não encontrada.")
    tenant_dir = TENANTS_DIR / tenant
    try:
        resolved = tenant_dir.resolve()
        tenants_root = TENANTS_DIR.resolve()
    except OSError as exc:
        raise ValueError("Empresa não encontrada.") from exc
    if tenants_root not in resolved.parents or not resolved.exists() or not resolved.is_dir():
        raise ValueError("Empresa não encontrada.")
    if LauncherState.current_tenant == tenant:
        stop_app_server()
    clear_client_tenant(tenant)
    shutil.rmtree(resolved)


class LauncherHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        route = urlparse(self.path).path
        if route == "/":
            html_response(self, APP_HTML)
        elif route == "/api/tenants":
            last_tenant = valid_last_client_tenant()
            json_response(
                self,
                {
                    "ok": True,
                    "mode": LAUNCHER_MODE,
                    "launcher_build": LAUNCHER_BUILD,
                    "partner": partner_payload(),
                    "representatives": representatives_payload(),
                    "last_tenant": last_tenant,
                    "auto_start": bool(last_tenant),
                    "tenants": tenant_payloads(),
                },
            )
        else:
            json_response(self, {"ok": False, "error": "Endpoint não encontrado."}, status=404)

    def do_POST(self) -> None:
        route = urlparse(self.path).path
        try:
            payload = read_request_json(self)
            if route == "/api/start":
                tenant = slugify(str(payload.get("tenant") or ""))
                if not tenant or not (TENANTS_DIR / tenant).exists() or tenant.startswith(HIDDEN_TENANT_PREFIXES):
                    raise ValueError("Empresa não encontrada.")
                stop_app_server()
                url, port, log_path = start_app_server(tenant)
                json_response(self, {"ok": True, "url": url, "port": port, "log_path": str(log_path), "opened_as_app": False})
            elif route == "/api/create":
                name = str(payload.get("name") or "").strip()
                code = str(payload.get("code") or "").strip()
                tenant = create_tenant(name, code)
                json_response(self, {"ok": True, "tenant": tenant, "name": tenant_label(tenant)})
            elif route == "/api/partner/onboarding":
                partner = save_partner_onboarding(payload)
                json_response(self, {"ok": True, "partner": partner})
            elif route == "/api/partner/select":
                partner = select_partner(payload)
                json_response(self, {"ok": True, "partner": partner})
            elif route == "/api/delete":
                tenant = str(payload.get("tenant") or "")
                company_code = str(payload.get("company_code") or "")
                name = str(payload.get("name") or "")
                delete_tenant(tenant, company_code, name)
                json_response(self, {"ok": True})
            elif route == "/api/stop":
                stop_app_server()
                json_response(self, {"ok": True})
            else:
                json_response(self, {"ok": False, "error": "Endpoint não encontrado."}, status=404)
        except RuntimeError as exc:
            json_response(self, {"ok": False, "error": str(exc)}, status=500)
        except (ValueError, OSError, json.JSONDecodeError) as exc:
            json_response(self, {"ok": False, "error": str(exc)}, status=400)

    def log_message(self, format: str, *args: object) -> None:
        return


def read_launcher_payload(port: int) -> dict:
    try:
        with urllib.request.urlopen(f"http://{HOST}:{port}/api/tenants", timeout=0.35) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def existing_launcher_url() -> str:
    first_port = min(LAUNCHER_PORTS.values())
    for port in range(first_port, first_port + 60):
        payload = read_launcher_payload(port)
        if payload.get("ok") and payload.get("mode") == LAUNCHER_MODE and payload.get("launcher_build") == LAUNCHER_BUILD:
            return f"http://{HOST}:{port}"
    return ""


def open_last_from_existing_launcher(existing_url: str, tenant: str) -> bool:
    try:
        body = json.dumps({"tenant": tenant}).encode("utf-8")
        request = urllib.request.Request(
            f"{existing_url}/api/start",
            data=body,
            headers={"content-type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception:
        return False
    if not isinstance(payload, dict) or not payload.get("ok") or not payload.get("url"):
        return False
    open_app_window(str(payload["url"]), f"app_{tenant}")
    return True


def open_last_client_directly(tenant: str) -> bool:
    try:
        url, _, _ = start_app_server(tenant)
    except RuntimeError:
        return False
    open_app_window(url, f"app_{tenant}")
    return True


def main() -> None:
    last_tenant = valid_last_client_tenant()
    existing_url = existing_launcher_url()
    if existing_url:
        if last_tenant and open_last_from_existing_launcher(existing_url, last_tenant):
            return
        open_app_window(existing_url, f"launcher_{LAUNCHER_MODE}")
        return
    if last_tenant and open_last_client_directly(last_tenant):
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            stop_app_server()
        return
    port = choose_port(LAUNCHER_PORT, HOST)
    server = ThreadingHTTPServer((HOST, port), LauncherHandler)
    threading.Thread(target=server.serve_forever, name="pulso-launcher", daemon=True).start()
    open_app_window(f"http://{HOST}:{port}", f"launcher_{LAUNCHER_MODE}")
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        stop_app_server()
        server.shutdown()


if __name__ == "__main__":
    main()
