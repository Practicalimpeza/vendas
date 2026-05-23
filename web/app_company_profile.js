function companyProfileField(field, label, value, options = {}) {
  const tag = options.textarea ? "textarea" : "input";
  const attrs = [
    `class="inline-input${options.className ? ` ${escapeAttr(options.className)}` : ""}"`,
    `id="${escapeAttr(field)}"`,
    `data-company-field="${escapeAttr(field)}"`,
    options.placeholder ? `placeholder="${escapeAttr(options.placeholder)}"` : "",
    options.maxlength ? `maxlength="${escapeAttr(options.maxlength)}"` : "",
  ].filter(Boolean).join(" ");
  const control = tag === "textarea"
    ? `<textarea ${attrs} rows="${options.rows || 3}">${escapeHtml(value || "")}</textarea>`
    : `<input ${attrs} value="${inputValue(value || "")}" />`;
  return `
    <label class="modal-field">
      <span>${escapeHtml(label)}</span>
      ${control}
    </label>
  `;
}

function companyLogoEditorMarkup(adjust = {}) {
  const fit = adjust.fit || "contain";
  return `
    <div class="company-logo-editor" id="companyLogoEditor">
      <div class="company-logo-crop-preview">
        <img id="companyLogoCropPreview" src="" alt="Ajuste da logo" />
      </div>
      <div class="company-logo-controls">
        <div class="onboarding-fit-toggle" role="group" aria-label="Enquadramento da logo">
          <button class="${fit === "contain" ? "active" : ""}" type="button" data-company-logo-fit="contain">Conter</button>
          <button class="${fit === "cover" ? "active" : ""}" type="button" data-company-logo-fit="cover">Preencher</button>
        </div>
        <label>
          <span>Zoom</span>
          <input type="range" min="0.75" max="2.4" step="0.05" value="${escapeAttr(adjust.zoom || 1)}" data-company-logo-adjust="zoom" />
        </label>
        <label>
          <span>Horizontal</span>
          <input type="range" min="-160" max="160" step="2" value="${escapeAttr(adjust.x || 0)}" data-company-logo-adjust="x" />
        </label>
        <label>
          <span>Vertical</span>
          <input type="range" min="-160" max="160" step="2" value="${escapeAttr(adjust.y || 0)}" data-company-logo-adjust="y" />
        </label>
      </div>
    </div>
  `;
}

function companyLogoAdjustOverlayMarkup(hidden = true) {
  return `
    <div class="company-logo-adjust-overlay" id="companyLogoAdjustOverlay"${hidden ? " hidden" : ""}>
      <div class="company-logo-adjust-backdrop" data-company-logo-close></div>
      <section class="company-logo-adjust-panel" role="dialog" aria-modal="true" aria-labelledby="companyLogoAdjustTitle">
        <header>
          <div>
            <span>Logo da empresa</span>
            <strong id="companyLogoAdjustTitle">Ajustar enquadramento</strong>
          </div>
          <button class="modal-close" type="button" data-company-logo-close aria-label="Fechar ajuste">x</button>
        </header>
        <div class="company-logo-adjust-body" id="companyLogoEditorSlot"></div>
        <footer>
          <button class="secondary-button" type="button" data-company-logo-close>Cancelar</button>
          <button class="action-button" type="button" id="companyLogoApply">Aplicar logo</button>
        </footer>
      </section>
    </div>
  `;
}

function ensureCompanyLogoAdjustOverlay() {
  let overlay = document.querySelector("#companyLogoAdjustOverlay");
  if (!overlay) {
    document.body.insertAdjacentHTML("beforeend", companyLogoAdjustOverlayMarkup());
    overlay = document.querySelector("#companyLogoAdjustOverlay");
  }
  return overlay;
}

function companyLogoUploadFromCanvas(dataUrl, fileName = "logo.png") {
  return {
    file_name: fileName.replace(/\.[^.]+$/, "") + ".png",
    mime_type: "image/png",
    size: Math.round((dataUrl.length * 3) / 4),
    data_url: dataUrl,
  };
}

function companyLoadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function renderCompanyAdjustedLogo(logoState) {
  if (!logoState.original) return "";
  const adjust = logoState.adjust || { fit: "contain", zoom: 1, x: 0, y: 0 };
  const image = await companyLoadImage(logoState.original);
  if (!logoState.contentBox) logoState.contentBox = detectCompanyLogoContentBox(image);
  const source = logoState.contentBox || { x: 0, y: 0, width: image.width, height: image.height };
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const scaleContain = Math.min(canvas.width / source.width, canvas.height / source.height);
  const scaleCover = Math.max(canvas.width / source.width, canvas.height / source.height);
  const baseScale = adjust.fit === "cover" ? scaleCover : scaleContain;
  const scale = baseScale * Number(adjust.zoom || 1);
  const width = source.width * scale;
  const height = source.height * scale;
  const x = (canvas.width - width) / 2 + Number(adjust.x || 0);
  const y = (canvas.height - height) / 2 + Number(adjust.y || 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, source.x, source.y, source.width, source.height, x, y, width, height);
  return canvas.toDataURL("image/png");
}

function detectCompanyLogoContentBox(image) {
  const maxSide = 768;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  let pixels;
  try {
    pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  } catch (error) {
    return { x: 0, y: 0, width: image.width, height: image.height };
  }
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const alpha = pixels[(y * canvas.width + x) * 4 + 3];
      if (alpha <= 8) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return { x: 0, y: 0, width: image.width, height: image.height };
  const alphaTouchesEdges = minX <= 1 && minY <= 1 && maxX >= canvas.width - 2 && maxY >= canvas.height - 2;
  if (alphaTouchesEdges) {
    const backgroundBox = detectCompanyLogoForegroundByCorners(pixels, canvas.width, canvas.height);
    if (backgroundBox) {
      ({ minX, minY, maxX, maxY } = backgroundBox);
    }
  }
  const padding = Math.round(Math.max(maxX - minX + 1, maxY - minY + 1) * 0.04);
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(canvas.width - 1, maxX + padding);
  maxY = Math.min(canvas.height - 1, maxY + padding);
  return {
    x: minX / scale,
    y: minY / scale,
    width: (maxX - minX + 1) / scale,
    height: (maxY - minY + 1) / scale,
  };
}

function detectCompanyLogoForegroundByCorners(pixels, width, height) {
  const cornerIndexes = [0, width - 1, (height - 1) * width, height * width - 1].map((pixel) => pixel * 4);
  const corners = cornerIndexes.map((index) => [pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3]]);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let foregroundPixels = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = pixels[index + 3];
      if (alpha <= 8) continue;
      const distance = Math.min(
        ...corners.map((corner) => Math.abs(pixels[index] - corner[0]) + Math.abs(pixels[index + 1] - corner[1]) + Math.abs(pixels[index + 2] - corner[2])),
      );
      if (distance <= 28) continue;
      foregroundPixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || foregroundPixels < width * height * 0.006) return null;
  const trimsEdge = minX > 3 || minY > 3 || maxX < width - 4 || maxY < height - 4;
  return trimsEdge ? { minX, minY, maxX, maxY } : null;
}

function updateCompanyProfilePreview(body) {
  const profile = {};
  body.querySelectorAll("[data-company-field]").forEach((field) => {
    profile[field.dataset.companyField] = field.value.trim();
  });
  const logo = profile.logo_path || appLogoPath();
  const name = profile.trade_name || profile.legal_name || "Empresa";
  const address = [profile.address_line, profile.address_number, profile.district, profile.city, profile.state]
    .filter(Boolean)
    .join(", ");
  body.querySelector("#companyPreviewLogo").src = logo;
  body.querySelector("#companyPreviewName").textContent = name;
  body.querySelector("#companyPreviewDoc").textContent = profile.document || "Documento não informado";
  body.querySelector("#companyPreviewAddress").textContent = address || "Endereço ainda não preenchido";
}

async function openCompanyProfileModal() {
  let profile;
  try {
    profile = await loadCompanyProfile({ force: true });
  } catch (error) {
    openModal(
      "Perfil da empresa",
      `
        <div class="modal-preview warn">Reinicie o servidor do ${escapeHtml(appName())} para habilitar o cadastro da empresa.</div>
        <div class="modal-actions">
          <button class="secondary-button" type="button" id="companyProfileCancel">Fechar</button>
        </div>
      `,
      (body) => body.querySelector("#companyProfileCancel").addEventListener("click", closeModal),
    );
    return;
  }
  openModal(
    "Perfil da empresa",
    `
      <div class="modal-context">
        <strong>Dados usados em documentos do ${escapeHtml(appName())}</strong>
        <span>Logo, identificação, endereço e textos padrão para cotações, pedidos, relatórios e documentos gerados pela mesa.</span>
      </div>
      ${
        canAccessView("admin")
          ? `<button class="company-profile-admin-shortcut" type="button" id="companyProfileAdmin">
              <i data-lucide="shield-check"></i>
              <span>
                <strong>Administração e acessos</strong>
                <em>Usuários, permissões e segurança da empresa</em>
              </span>
        </button>`
          : ""
      }
      <div class="company-profile-layout">
        <section class="company-profile-form">
          <input type="hidden" data-company-field="logo_path" value="${inputValue(profile.logo_path || "")}" />
          <div class="form-grid two">
            ${companyProfileField("trade_name", "Nome fantasia", profile.trade_name, { maxlength: 160 })}
            ${companyProfileField("legal_name", "Razao social", profile.legal_name, { maxlength: 200 })}
            ${companyProfileField("document", "CNPJ / CPF", profile.document, { maxlength: 40, placeholder: "00.000.000/0000-00" })}
            ${companyProfileField("state_registration", "Inscrição estadual", profile.state_registration, { maxlength: 40 })}
            ${companyProfileField("municipal_registration", "Inscrição municipal", profile.municipal_registration, { maxlength: 40 })}
            ${companyProfileField("contact_name", "Responsável", profile.contact_name, { maxlength: 120 })}
            ${companyProfileField("phone", "Telefone", profile.phone, { maxlength: 60 })}
            ${companyProfileField("email", "E-mail", profile.email, { maxlength: 160 })}
            ${companyProfileField("website", "Site", profile.website, { maxlength: 180 })}
          </div>
          <div class="form-grid two">
            ${companyProfileField("address_line", "Endereco", profile.address_line, { maxlength: 200 })}
            ${companyProfileField("address_number", "Número", profile.address_number, { maxlength: 40 })}
            ${companyProfileField("address_complement", "Complemento", profile.address_complement, { maxlength: 120 })}
            ${companyProfileField("district", "Bairro", profile.district, { maxlength: 120 })}
            ${companyProfileField("city", "Cidade", profile.city, { maxlength: 120 })}
            ${companyProfileField("state", "UF", profile.state, { maxlength: 40 })}
            ${companyProfileField("postal_code", "CEP", profile.postal_code, { maxlength: 30 })}
            ${companyProfileField("country", "Pais", profile.country || "Brasil", { maxlength: 80 })}
          </div>
          ${companyProfileField("document_footer", "Rodapé padrão dos documentos", profile.document_footer, { textarea: true, rows: 2, maxlength: 500, placeholder: "Ex.: Obrigado pela preferência. Valores sujeitos a confirmação." })}
          ${companyProfileField("default_payment_terms", "Condições comerciais padrão", profile.default_payment_terms, { textarea: true, rows: 2, maxlength: 300, placeholder: "Ex.: Pagamento faturado, entrega combinada com compras." })}
          ${companyProfileField("notes", "Observacoes internas", profile.notes, { textarea: true, rows: 3, maxlength: 700 })}
        </section>
        <aside class="company-profile-preview">
          <div class="company-profile-preview-head">
            <span>Pr?via</span>
            <label class="text-button company-logo-inline-button">
              Trocar logo
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" data-company-logo-file hidden />
            </label>
          </div>
          <img id="companyPreviewLogo" src="${escapeAttr(companyProfileLogoPath(profile))}" alt="Logo da empresa" />
          <strong id="companyPreviewName">${escapeHtml(companyProfileName(profile) || "Empresa")}</strong>
          <em id="companyPreviewDoc">${escapeHtml(profile.document || "Documento não informado")}</em>
          <p id="companyPreviewAddress">Endereço ainda não preenchido</p>
        </aside>
      </div>
      <div class="modal-preview good">Ao salvar, esses dados ficam disponíveis para documentos gerados pelo ${escapeHtml(appName())}.</div>
      <div class="modal-actions">
        <button class="secondary-button" type="button" id="companyProfileCancel">Cancelar</button>
        <button class="action-button" type="button" id="companyProfileSave">Salvar perfil</button>
      </div>
      <span class="save-state" id="companyProfileSaveState" aria-live="polite"></span>
    `,
    (body) => {
      const saveState = body.querySelector("#companyProfileSaveState");
      let logoUpload = null;
      let pendingLogoUpload = null;
      let pendingLogoPreview = "";
      let appliedLogoPreview = "";
      const logoState = { original: "", adjust: { fit: "contain", zoom: 1, x: 0, y: 0 }, fileName: "logo.png" };
      const overlay = ensureCompanyLogoAdjustOverlay();
      const closeCompanyLogoOverlay = () => {
        overlay.hidden = true;
        const fileInput = body.querySelector("[data-company-logo-file]");
        if (fileInput) fileInput.value = "";
      };
      const refreshCompanyLogoEditor = async () => {
        if (!logoState.original) return;
        const slot = overlay.querySelector("#companyLogoEditorSlot");
        if (slot && !slot.innerHTML) slot.innerHTML = companyLogoEditorMarkup(logoState.adjust);
        try {
          const dataUrl = await renderCompanyAdjustedLogo(logoState);
          pendingLogoPreview = dataUrl;
          pendingLogoUpload = companyLogoUploadFromCanvas(dataUrl, logoState.fileName);
          overlay.querySelector("#companyLogoCropPreview").src = dataUrl;
          saveState.textContent = "Ajuste a logo e clique em aplicar";
        } catch (error) {
          saveState.textContent = "N?o foi poss?vel ajustar essa logo.";
        }
      };
      const bindCompanyLogoEditor = () => {
        overlay.querySelectorAll("[data-company-logo-fit]").forEach((button) => {
          button.addEventListener("click", async () => {
            logoState.adjust.fit = button.dataset.companyLogoFit || "contain";
            overlay.querySelector("#companyLogoEditorSlot").innerHTML = companyLogoEditorMarkup(logoState.adjust);
            bindCompanyLogoEditor();
            await refreshCompanyLogoEditor();
          });
        });
        overlay.querySelectorAll("[data-company-logo-adjust]").forEach((input) => {
          input.addEventListener("input", async () => {
            logoState.adjust[input.dataset.companyLogoAdjust] = Number(input.value || 0);
            await refreshCompanyLogoEditor();
          });
        });
      };
      updateCompanyProfilePreview(body);
      body.querySelectorAll("[data-company-field]").forEach((field) => {
        field.addEventListener("input", () => {
          updateCompanyProfilePreview(body);
          if (appliedLogoPreview) body.querySelector("#companyPreviewLogo").src = appliedLogoPreview;
        });
      });
      body.querySelector("#companyProfileAdmin")?.addEventListener("click", () => {
        closeModal();
        setView("admin");
      });
      if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 2.1 } });
      overlay.querySelectorAll("[data-company-logo-close]").forEach((button) => {
        button.addEventListener("click", closeCompanyLogoOverlay);
      });
      overlay.querySelector("#companyLogoApply").addEventListener("click", () => {
        if (!pendingLogoUpload || !pendingLogoPreview) return;
        logoUpload = pendingLogoUpload;
        appliedLogoPreview = pendingLogoPreview;
        body.querySelector("#companyPreviewLogo").src = pendingLogoPreview;
        saveState.textContent = "Logo ajustada. Salve o perfil para confirmar.";
        closeCompanyLogoOverlay();
      });
      body.querySelector("[data-company-logo-file]")?.addEventListener("change", (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const allowed = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
        if (!allowed.includes(file.type) || file.size > 2_000_000) {
          event.target.value = "";
          saveState.textContent = "Envie uma logo PNG, JPG, WEBP ou SVG com at? 2 MB.";
          return;
        }
        const reader = new FileReader();
        reader.addEventListener("load", async () => {
          logoState.original = String(reader.result || "");
          logoState.adjust = { fit: "contain", zoom: 1, x: 0, y: 0 };
          logoState.fileName = file.name || "logo.png";
          logoState.contentBox = null;
          pendingLogoUpload = null;
          pendingLogoPreview = "";
          overlay.hidden = false;
          overlay.querySelector("#companyLogoEditorSlot").innerHTML = companyLogoEditorMarkup(logoState.adjust);
          bindCompanyLogoEditor();
          await refreshCompanyLogoEditor();
        });
        reader.readAsDataURL(file);
      });
      body.querySelector("#companyProfileCancel").addEventListener("click", closeModal);
      body.querySelector("#companyProfileSave").addEventListener("click", async () => {
        const payload = {};
        body.querySelectorAll("[data-company-field]").forEach((field) => {
          payload[field.dataset.companyField] = field.value.trim();
        });
        payload.organization_id = profile.organization_id || "";
        if (logoUpload) payload.logo_upload = logoUpload;
        saveState.textContent = "Salvando";
        try {
          state.companyProfile = await apiPost("/api/company-profile", payload);
          if (state.companyProfile.logo_path) {
            body.querySelector("[data-company-field='logo_path']").value = state.companyProfile.logo_path;
            state.appConfig = { ...state.appConfig, logo_path: state.companyProfile.logo_path };
            applyAppConfig();
          }
          updateTopbar(document.querySelector(".view.active")?.id || "dashboard");
          renderGeneralMap();
          saveState.textContent = "Perfil salvo";
          setTimeout(closeModal, 450);
        } catch (error) {
          saveState.textContent = error.message;
        }
      });
    },
    {
      modalClass: "company-profile-modal",
      onClose: () => document.querySelector("#companyLogoAdjustOverlay")?.remove(),
    },
  );
}
