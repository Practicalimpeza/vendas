from __future__ import annotations

import json
import sqlite3

from commercial import api_commercial_intelligence
from db_helpers import date_where, one, parse_decimal, parse_int, resolve_period, rows, scalar_text
from quotes import api_quote_drafts
from replenishment import clamp


def api_summary(conn: sqlite3.Connection, period: dict | None = None) -> dict:
    period = period or resolve_period(conn, {"period_days": "all"})
    product_where, product_params = date_where("sold_at", period, "WHERE")
    service_where, service_params = date_where("emitted_at", period, "WHERE")
    raw_days = period.get("period_days")
    period_days = raw_days if isinstance(raw_days, int) else None
    use_daily = period_days is not None and period_days <= 60
    bucket_len = 10 if use_daily else 7
    granularity = "day" if use_daily else "month"
    return {
        "contract": "summary.v1",
        "kpis": one(
            conn,
            f"""
            SELECT
                (SELECT COUNT(DISTINCT product_id) FROM product_sales {product_where}) AS products,
                (
                    SELECT COUNT(*)
                    FROM (
                        SELECT c.organization_id, c.canonical_name
                        FROM (
                            SELECT customer_id
                            FROM product_sales
                            WHERE customer_id IS NOT NULL{product_where.replace(" WHERE ", " AND ")}
                            UNION ALL
                            SELECT customer_id
                            FROM service_sales
                            WHERE customer_id IS NOT NULL{service_where.replace(" WHERE ", " AND ")}
                        ) sales
                        JOIN customers c ON c.id = sales.customer_id
                        WHERE c.canonical_name <> 'consumidor'
                        GROUP BY c.organization_id, c.canonical_name
                    )
                ) AS customers,
                (SELECT ROUND(COALESCE(SUM(gross_amount), 0), 2) FROM product_sales {product_where}) AS product_revenue,
                (SELECT ROUND(COALESCE(SUM(gross_amount), 0), 2) FROM service_sales {service_where}) AS service_revenue,
                (
                    SELECT ROUND(COALESCE(SUM(quantity_on_hand), 0), 2)
                    FROM inventory_snapshots inv
                    WHERE inv.id = (
                        SELECT inv2.id
                        FROM inventory_snapshots inv2
                        WHERE inv2.organization_id = inv.organization_id
                          AND inv2.store_id = inv.store_id
                          AND inv2.product_id = inv.product_id
                        ORDER BY inv2.snapshot_date DESC, inv2.id DESC
                        LIMIT 1
                    )
                ) AS stock_units,
                (SELECT COUNT(*) FROM implementation_tasks WHERE status = 'open') AS open_tasks
            """,
            (*product_params, *product_params, *service_params, *product_params, *service_params),
        ),
        "monthly": rows(
            conn,
            f"""
            SELECT bucket AS month, ROUND(SUM(product_revenue), 2) AS product_revenue, ROUND(SUM(service_revenue), 2) AS service_revenue
            FROM (
                SELECT substr(sold_at, 1, {bucket_len}) AS bucket, SUM(gross_amount) AS product_revenue, 0 AS service_revenue
                FROM product_sales {product_where} GROUP BY substr(sold_at, 1, {bucket_len})
                UNION ALL
                SELECT substr(emitted_at, 1, {bucket_len}) AS bucket, 0, SUM(gross_amount)
                FROM service_sales {service_where} GROUP BY substr(emitted_at, 1, {bucket_len})
            )
            GROUP BY bucket
            ORDER BY bucket
            """,
            (*product_params, *service_params),
        ),
        "monthly_granularity": granularity,
        "tasks": rows(
            conn,
            """
            SELECT task_type, title, priority, status
            FROM implementation_tasks
            ORDER BY priority, id
            LIMIT 8
            """
        ),
        "period": period,
    }


def pct(part: float, total: float) -> float:
    return round((part / total * 100.0), 1) if total else 0.0


def maturity_stage(score: int) -> dict:
    if score >= 80:
        return {"level": 5, "name": "Otimizacao", "label": "Hub cerebral em otimizacao"}
    if score >= 65:
        return {"level": 4, "name": "Inteligencia comercial", "label": "BI acionavel em expansao"}
    if score >= 45:
        return {"level": 3, "name": "Rotina de gestao", "label": "Operacao aprendendo com o uso"}
    if score >= 25:
        return {"level": 2, "name": "Compra assistida", "label": "Cotacao e reposicao desbloqueadas"}
    return {"level": 1, "name": "Leitura", "label": "Dados basicos entendidos"}


def capability(title: str, body: str, status: str, impact: str = "", action: str = "", view: str = "") -> dict:
    return {
        "title": title,
        "body": body,
        "status": status,
        "impact": impact,
        "action": action,
        "view": view,
    }


def focus_action(title: str, body: str, impact: str, action: str, view: str, scope: str, evidence: str = "") -> dict:
    return {
        "title": title,
        "body": body,
        "impact": impact,
        "action": action,
        "view": view,
        "scope": scope,
        "evidence": evidence,
    }


def mission(
    key: str,
    title: str,
    body: str,
    reward: str,
    unlocks: str,
    effort: str,
    progress: float,
    status: str,
    action: str,
    view: str,
    evidence: str = "",
) -> dict:
    return {
        "key": key,
        "title": title,
        "body": body,
        "reward": reward,
        "unlocks": unlocks,
        "effort": effort,
        "progress": round(clamp(progress, 0, 100), 1),
        "status": status,
        "action": action,
        "view": view,
        "evidence": evidence,
    }


def api_maturity(conn: sqlite3.Connection) -> dict:
    data = one(
        conn,
        """
        SELECT
            (SELECT COUNT(*) FROM products WHERE active = 1) AS products,
            (SELECT COUNT(*) FROM product_sales) AS product_sales,
            (SELECT COUNT(DISTINCT product_id) FROM product_sales) AS products_with_sales,
            (SELECT COUNT(*) FROM service_sales) AS service_sales,
            (SELECT COUNT(*) FROM customers) AS customers,
            (SELECT COUNT(DISTINCT product_id) FROM inventory_snapshots) AS products_with_stock,
            (SELECT COUNT(DISTINCT product_id) FROM cost_snapshots) AS products_with_cost,
            (SELECT COUNT(DISTINCT product_id) FROM product_identifiers WHERE identifier_type = 'supplier_reference') AS products_with_reference,
            (SELECT COUNT(*) FROM brands) AS brands,
            (SELECT COUNT(*) FROM brand_supplier_rules WHERE active = 1) AS brands_with_supplier,
            (SELECT COUNT(*) FROM suppliers WHERE COALESCE(contact_phone, '') <> '') AS suppliers_with_phone,
            (SELECT COUNT(*) FROM suppliers WHERE COALESCE(minimum_order_value, 0) > 0) AS suppliers_with_minimum,
            (SELECT COUNT(*) FROM suppliers) AS suppliers,
            (SELECT COUNT(DISTINCT supplier_id) FROM brand_supplier_rules WHERE active = 1) AS distinct_brand_suppliers,
            (SELECT COUNT(*) FROM brand_supplier_rules WHERE active = 1 AND notes LIKE 'Fornecedor padrao criado%') AS inferred_brand_supplier_rules,
            (SELECT COUNT(*) FROM quote_requests) AS quotes,
            (SELECT COUNT(*) FROM quote_requests WHERE status = 'sent') AS sent_quotes,
            (SELECT COUNT(*) FROM quote_requests WHERE status IN ('responded', 'approved')) AS learned_quotes,
            (SELECT COUNT(*) FROM action_items WHERE status = 'completed') AS completed_actions,
            (SELECT COUNT(*) FROM action_items WHERE status IN ('open', 'in_progress')) AS open_actions,
            (SELECT COUNT(*) FROM product_settings WHERE COALESCE(package_size, 1) > 1) AS products_with_package,
            (SELECT COUNT(DISTINCT substr(sold_at, 1, 7)) FROM product_sales) AS sales_months
        """
    )
    quote_draft = api_quote_drafts(conn)
    commercial = api_commercial_intelligence(conn)
    commercial_summary = commercial.get("summary", {})
    products = int(data.get("products") or 0)
    brands = int(data.get("brands") or 0)
    suppliers = int(data.get("suppliers") or 0)
    quotes = int(data.get("quotes") or 0)
    quote_suppliers = int(quote_draft["summary"]["supplier_count"])
    quote_items = int(quote_draft["summary"]["item_count"])
    at_risk_customers = int(commercial_summary.get("at_risk_customers") or 0)
    due_customers = int(commercial_summary.get("due_customers") or 0)
    completed_actions = int(data.get("completed_actions") or 0)
    distinct_brand_suppliers = int(data.get("distinct_brand_suppliers") or 0)
    inferred_supplier_count = int(data.get("brands_with_supplier") or 0)
    inferred_brand_supplier_rules = int(data.get("inferred_brand_supplier_rules") or 0)

    score = 0
    if products:
        score += 5
    if int(data.get("product_sales") or 0):
        score += 7
    if int(data.get("products_with_stock") or 0):
        score += 5
    if int(data.get("products_with_cost") or 0):
        score += 5
    if int(data.get("customers") or 0):
        score += 4
    score += min(8, int(round(pct(data.get("products_with_reference") or 0, products) / 12.5)))
    score += min(8, int(round(pct(data.get("brands_with_supplier") or 0, brands) / 12.5)))
    score += 10 if quote_suppliers else 0
    score += min(8, int(round(pct(data.get("suppliers_with_phone") or 0, suppliers) / 12.5)))
    score += min(8, int(round(pct(data.get("products_with_package") or 0, products) / 12.5)))
    score += 7 if quotes else 0
    score += 5 if int(data.get("sent_quotes") or 0) else 0
    score += 6 if int(data.get("learned_quotes") or 0) else 0
    score += 4 if int(data.get("sales_months") or 0) >= 6 else 0
    score += 6 if at_risk_customers or due_customers else 0
    score += min(6, completed_actions * 2)
    score = int(clamp(score, 0, 100))

    unlocked = []
    next_actions = []
    improvements = []

    unlocked.append(
        capability(
            "Leitura operacional importada",
            f"{products} produtos, {data.get('product_sales') or 0} vendas de produtos e {data.get('customers') or 0} clientes foram entendidos.",
            "unlocked" if products else "locked",
            "Base minima para BI e reposicao.",
            "Ver importacao",
            "imports",
        )
    )
    if quote_suppliers:
        unlocked.append(
            capability(
                "Cotacao por fornecedor desbloqueada",
                f"{quote_suppliers} fornecedores tem {quote_items} itens prontos para cotacao com os dados atuais.",
                "unlocked",
                "Transforma dados importados em acao de compra.",
                "Abrir compras",
                "quotes",
            )
        )
    feasible_actions = []
    if inferred_brand_supplier_rules and quote_suppliers:
        feasible_actions.append(
            focus_action(
                "Agrupar marcas por fornecedor real",
                "Se um fornecedor atende varias marcas, comece juntando essas marcas antes de preencher dados comerciais.",
                "Melhora o agrupamento da cotacao e revela melhor o tamanho do pedido.",
                "Configurar fornecedores",
                "suppliers",
                "algumas marcas",
                "Os fornecedores iniciais foram inferidos por marca.",
            )
        )
    if quote_suppliers:
        feasible_actions.append(
            focus_action(
                "Gerar uma cotacao piloto",
                "Comece por um fornecedor ja detectado como cotavel. A cotacao tambem pode revelar caixa, divisor e disponibilidade.",
                "Entrega valor imediato e cria o primeiro dado operacional real.",
                "Abrir compras",
                "quotes",
                "1 fornecedor",
                f"{quote_suppliers} fornecedores prontos; escolha 1.",
            )
        )
    if int(data.get("products_with_reference") or 0):
        unlocked.append(
            capability(
                "Referencia de fornecedor reconhecida",
                f"{data.get('products_with_reference')} produtos ja tem referencia para usar na cotacao.",
                "unlocked",
                "Evita enviar codigo interno como se fosse codigo do fornecedor.",
                "Ver compras",
                "quotes",
            )
        )
    if int(data.get("sales_months") or 0) >= 6:
        unlocked.append(
            capability(
                "Historico suficiente para tendencia",
                f"{data.get('sales_months')} meses com vendas importadas.",
                "unlocked",
                "Permite comparar giro recente contra historico.",
                "Ver oportunidades",
                "opportunities",
            )
        )
    if at_risk_customers or due_customers:
        unlocked.append(
            capability(
                "Inteligencia comercial inicial",
                f"{at_risk_customers} clientes em risco e {due_customers} com recompra proxima foram detectados.",
                "unlocked",
                "Transforma historico em acao comercial simples.",
                "Ver oportunidades",
                "opportunities",
            )
        )
        feasible_actions.append(
            focus_action(
                "Recuperar um cliente em risco",
                "Escolha um cliente relevante que saiu da cadencia e faca um contato simples antes de tentar criar campanhas complexas.",
                "Mostra valor comercial do BI logo na implantacao.",
                "Ver oportunidades",
                "opportunities",
                "1 cliente",
                f"{at_risk_customers} clientes estao fora do ritmo esperado.",
            )
        )
    if quotes:
        improvements.append(
            capability(
                "O Nexo comecou a aprender com cotações",
                f"{quotes} cotacao(oes) registradas; {data.get('sent_quotes') or 0} marcada(s) como enviada(s).",
                "improved",
                "Abre caminho para comparar sugerido, cotado e comprado.",
                "Abrir compras",
                "quotes",
            )
        )
    if completed_actions:
        improvements.append(
            capability(
                "Rotina operacional registrada",
                f"{completed_actions} acao(oes) concluidas na mesa do gestor.",
                "improved",
                "O Nexo deixa de ser so leitura e passa a guardar execucao.",
                "Abrir hoje",
                "actions",
            )
        )

    reference_pct = pct(data.get("products_with_reference") or 0, products)
    phone_pct = pct(data.get("suppliers_with_phone") or 0, suppliers)
    minimum_pct = pct(data.get("suppliers_with_minimum") or 0, suppliers)
    package_pct = pct(data.get("products_with_package") or 0, products)
    supplier_pct = pct(data.get("brands_with_supplier") or 0, brands)

    if phone_pct < 60 and suppliers:
        top_supplier = (quote_draft["suppliers"] or [{}])[0]
        if minimum_pct < 60:
            next_actions.append(
                capability(
                    "Cadastrar pedido minimo do fornecedor piloto",
                    f"Comece por {top_supplier.get('supplier_name') or 'um fornecedor prioritario'}, sem tentar completar todos os fornecedores.",
                    "next",
                    "Melhora a decisao de quando vale fechar uma cotacao.",
                    "Configurar fornecedores",
                    "suppliers",
                )
            )
            feasible_actions.append(
                focus_action(
                    "Informar pedido minimo do fornecedor piloto",
                    "Esse dado pode vir antes ou depois da primeira cotacao, dependendo de como o fornecedor trabalha.",
                    "A reposicao fica mais realista para o fornecedor escolhido.",
                    "Configurar fornecedores",
                    "suppliers",
                    "1 valor minimo",
                    f"{top_supplier.get('supplier_name') or 'Fornecedor prioritario'} aparece na fila de cotacao.",
                )
            )
        next_actions.append(
            capability(
                "Preencher telefone do primeiro fornecedor cotavel",
                f"Comece por {top_supplier.get('supplier_name') or 'um fornecedor prioritario'}, que ja tem itens para cotar.",
                "next",
                "Torna a rotina de cotacao mais fluida sem exigir cadastro completo.",
                "Configurar fornecedores",
                "suppliers",
            )
        )
        feasible_actions.append(
            focus_action(
                "Completar contato do fornecedor piloto",
                "Preencha o telefone apenas do fornecedor que voce vai cotar primeiro.",
                "Prepara o caminho para WhatsApp e reduz atrito na rotina.",
                "Configurar fornecedores",
                "suppliers",
                "1 telefone",
                f"{top_supplier.get('supplier_name') or 'Fornecedor prioritario'} aparece na fila de cotacao.",
            )
        )
    if package_pct < 25 and products:
        next_actions.append(
            capability(
                "Configurar embalagens de poucos itens prioritarios",
                "Comece pelos itens do fornecedor piloto antes de tentar corrigir a base inteira.",
                "next",
                "Melhora sugestao por caixa, fardo, saco ou pacote.",
                "Ver compras",
                "quotes",
            )
        )
        feasible_actions.append(
            focus_action(
                "Ajustar embalagens dos itens da primeira cotacao",
                "Se voce ainda nao sabe o divisor, deixe a cotacao descobrir: 31 un pode voltar como caixa 12x1L.",
                "A sugestao fica mais realista ja no primeiro pedido.",
                "Ver compras",
                "quotes",
                "aprendizado por item",
                "O divisor pode ser aprendido com a resposta do fornecedor.",
            )
        )
    if reference_pct < 80 and products:
        next_actions.append(
            capability(
                "Aumentar cobertura de referencias de fornecedor",
                f"{reference_pct}% dos produtos tem referencia importada.",
                "next",
                "Reduz atrito e erro na cotacao.",
                "Ver importacao",
                "imports",
            )
        )
    if quote_suppliers and not quotes:
        next_actions.insert(
            0,
            capability(
                "Gerar a primeira cotacao real",
                f"O sistema ja detectou {quote_suppliers} fornecedores prontos.",
                "next",
                "Cria o primeiro ciclo de aprendizado operacional.",
                "Abrir compras",
                "quotes",
            ),
        )
    if at_risk_customers or due_customers:
        next_actions.append(
            capability(
                "Rodar uma acao comercial pequena",
                f"Comece com 1 dos {at_risk_customers + due_customers} clientes detectados.",
                "next",
                "Valida o BI como rotina de venda, nao apenas como relatorio.",
                "Ver oportunidades",
                "opportunities",
            )
        )
    if supplier_pct < 100 and brands:
        next_actions.append(
            capability(
                "Revisar fornecedor por marca",
                f"{supplier_pct}% das marcas tem regra ativa.",
                "next",
                "Garante agrupamento correto das sugestoes.",
                "Configurar fornecedores",
                "suppliers",
            )
        )

    return {
        "score": score,
        "stage": maturity_stage(score),
        "metrics": {
            "products": products,
            "customers": int(data.get("customers") or 0),
            "sales_months": int(data.get("sales_months") or 0),
            "reference_pct": reference_pct,
            "supplier_pct": supplier_pct,
            "phone_pct": phone_pct,
            "minimum_pct": minimum_pct,
            "package_pct": package_pct,
            "quote_suppliers": quote_suppliers,
            "quote_items": quote_items,
            "quotes": quotes,
            "at_risk_customers": at_risk_customers,
            "due_customers": due_customers,
            "open_actions": int(data.get("open_actions") or 0),
            "completed_actions": completed_actions,
            "distinct_brand_suppliers": distinct_brand_suppliers,
            "inferred_brand_supplier_rules": inferred_brand_supplier_rules,
        },
        "unlocked": unlocked[:6],
        "improvements": improvements[:4],
        "next_actions": next_actions[:6],
        "focus": {
            "headline": "Comece pelo que ja da resultado",
            "body": "Com os dados atuais, o melhor caminho e fazer uma cotacao piloto e melhorar apenas o necessario para esse fornecedor.",
            "actions": feasible_actions[:3],
        },
        "missions": [
            mission(
                "quote_pilot",
                "Cotacao piloto",
                "Gere a primeira cotacao de um fornecedor que ja tem itens sugeridos.",
                "Primeiro ciclo real de compra assistida.",
                "Historico de cotacoes, comparacao sugerido vs cotado e aprendizado de embalagem.",
                "Baixo",
                100 if quotes else 0,
                "done" if quotes else "available",
                "Abrir compras",
                "quotes",
                f"{quote_suppliers} fornecedores prontos e {quote_items} itens cotaveis.",
            ),
            mission(
                "supplier_brand_mapping",
                "Mapa fornecedor x marcas",
                "Confirme ou agrupe marcas que pertencem ao mesmo fornecedor real.",
                "Cotas mais limpas e menos pedidos quebrados.",
                "Analise de fornecedor 360 e pedido minimo por mix real.",
                "Medio",
                100 - pct(inferred_brand_supplier_rules, max(inferred_supplier_count, 1)),
                "available" if inferred_brand_supplier_rules else "done",
                "Configurar fornecedores",
                "suppliers",
                f"{inferred_brand_supplier_rules} regras ainda foram inferidas automaticamente.",
            ),
            mission(
                "supplier_minimum",
                "Pedido minimo do fornecedor piloto",
                "Informe o minimo de um fornecedor prioritario ou descubra isso na primeira cotacao.",
                "Melhor decisao entre cotar agora ou esperar formar pedido.",
                "Dificuldade real do fornecedor e alvo de estoque mais preciso.",
                "Baixo",
                minimum_pct,
                "available" if minimum_pct < 100 else "done",
                "Configurar fornecedores",
                "suppliers",
                f"{minimum_pct}% dos fornecedores tem minimo cadastrado.",
            ),
            mission(
                "clean_active_mix",
                "Limpar foco do mix ativo",
                "Separe produtos sem estoque e sem venda recente da rotina principal.",
                "Menos ruido na tela de reposicao e cotacao.",
                "Trilhas de reativacao ou descontinuacao de produtos.",
                "Automatico",
                100,
                "done",
                "Ver compras",
                "quotes",
                "Produtos descontinuados ficam visiveis quando tem estoque, mas silenciosos para compra.",
            ),
            mission(
                "commercial_reactivation",
                "Recuperar cliente em risco",
                "Use a lista de oportunidades para fazer uma acao com um cliente que saiu da cadencia.",
                "Receita recuperada e prova rapida de valor comercial.",
                "Historico de acoes, lembretes e recomendacoes por cliente.",
                "Baixo",
                0,
                "available" if at_risk_customers else "locked",
                "Ver oportunidades",
                "opportunities",
                f"{at_risk_customers} clientes em risco detectados pela cadencia historica.",
            ),
            mission(
                "supplier_reference",
                "Referencia para cotacao",
                "Aumente a cobertura de referencias de fornecedor nos itens cotaveis.",
                "Cotacoes mais claras para o fornecedor.",
                "Menos retrabalho e mais confianca no envio por WhatsApp.",
                "Medio",
                reference_pct,
                "available" if reference_pct < 90 else "done",
                "Ver importacao",
                "imports",
                f"{reference_pct}% dos produtos tem referencia de fornecedor.",
            ),
        ],
    }


def api_top_products(conn: sqlite3.Connection, period: dict | None = None) -> list[dict]:
    period = period or resolve_period(conn, {"period_days": "all"})
    where_sql, params = date_where("s.sold_at", period, "WHERE")
    return rows(
        conn,
        f"""
        SELECT
            p.id,
            p.organization_id,
            p.source_code,
            p.name,
            COALESCE(b.name, '') AS brand_name,
            COALESCE(sup.id, '') AS supplier_id,
            COALESCE(sup.name, '') AS supplier_name,
            ROUND(SUM(s.quantity), 2) AS quantity,
            ROUND(SUM(s.gross_amount), 2) AS revenue,
            ROUND(SUM(s.gross_amount) * 100.0 / NULLIF((SELECT SUM(gross_amount) FROM product_sales s {where_sql}), 0), 2) AS share
        FROM product_sales s
        JOIN products p ON p.id = s.product_id
        LEFT JOIN brands b ON b.id = p.brand_id
        LEFT JOIN brand_supplier_rules bsr
          ON bsr.organization_id = p.organization_id
         AND bsr.brand_id = p.brand_id
         AND bsr.active = 1
        LEFT JOIN suppliers sup ON sup.id = bsr.supplier_id
        {where_sql}
        GROUP BY p.id
        HAVING revenue > 0
        ORDER BY revenue DESC
        """,
        (*params, *params),
    )


def api_product_detail(conn: sqlite3.Connection, product_id: str) -> dict:
    if not product_id:
        raise ValueError("Parametro id e obrigatorio.")
    product = one(
        conn,
        """
        SELECT
            p.id,
            p.organization_id,
            p.source_code,
            p.name,
            p.unit,
            p.active,
            b.name AS brand_name
        FROM products p
        LEFT JOIN brands b ON b.id = p.brand_id
        WHERE p.id = ?
        """,
        (product_id,),
    )
    if not product:
        raise ValueError("Produto nao encontrado.")
    identifiers = rows(
        conn,
        """
        SELECT identifier_type, identifier_value, source_system
        FROM product_identifiers
        WHERE product_id = ?
        ORDER BY identifier_type
        """,
        (product_id,),
    )
    barcode = next((i["identifier_value"] for i in identifiers if i["identifier_type"] == "barcode"), "")
    supplier_reference = next(
        (i["identifier_value"] for i in identifiers if i["identifier_type"] == "supplier_reference"),
        "",
    )
    settings = one(
        conn,
        """
        SELECT
            preferred_supplier_id,
            package_size,
            target_coverage_days,
            minimum_stock,
            maximum_stock,
            weight,
            expires,
            blocked_for_purchase,
            ignored_in_purchase_reports,
            marker,
            notes
        FROM product_settings
        WHERE product_id = ?
        """,
        (product_id,),
    ) or {}
    sales_summary = one(
        conn,
        """
        SELECT
            ROUND(COALESCE(SUM(quantity), 0), 2) AS quantity,
            ROUND(COALESCE(SUM(gross_amount), 0), 2) AS revenue,
            ROUND(COALESCE(MAX(quantity), 0), 2) AS max_single_sale,
            COUNT(DISTINCT sold_at) AS sale_days,
            MAX(sold_at) AS last_sale_at
        FROM product_sales
        WHERE product_id = ?
          AND quantity > 0
        """,
        (product_id,),
    ) or {}
    recent_decisions = rows(
        conn,
        """
        SELECT decision_type, decision_value, source_view, notes, created_at
        FROM operational_decisions
        WHERE entity_type = 'product'
          AND entity_id = ?
        ORDER BY created_at DESC
        LIMIT 8
        """,
        (product_id,),
    )
    latest = one(
        conn,
        """
        SELECT
            (SELECT quantity_on_hand FROM inventory_snapshots
              WHERE product_id = ? ORDER BY snapshot_date DESC, id DESC LIMIT 1) AS stock,
            (SELECT sale_price FROM price_snapshots
              WHERE product_id = ? ORDER BY snapshot_date DESC, id DESC LIMIT 1) AS sale_price,
            (SELECT total_cost FROM cost_snapshots
              WHERE product_id = ? ORDER BY snapshot_date DESC, id DESC LIMIT 1) AS total_cost
        """,
        (product_id, product_id, product_id),
    ) or {}
    return {
        "id": product["id"],
        "organization_id": product["organization_id"],
        "source_code": product["source_code"],
        "name": product["name"],
        "unit": product["unit"],
        "active": bool(product["active"]),
        "brand_name": product["brand_name"] or "",
        "barcode": barcode,
        "supplier_reference": supplier_reference,
        "identifiers": [dict(identifier) for identifier in identifiers],
        "settings": dict(settings),
        "sales_summary": dict(sales_summary),
        "recent_decisions": [dict(decision) for decision in recent_decisions],
        "stock": latest.get("stock"),
        "sale_price": latest.get("sale_price"),
        "total_cost": latest.get("total_cost"),
    }


def update_product_supplier_reference(conn: sqlite3.Connection, payload: dict) -> dict:
    organization_id = scalar_text(payload.get("organization_id"))
    product_id = scalar_text(payload.get("product_id"))
    value = scalar_text(payload.get("value"))[:120]
    if not organization_id or not product_id:
        raise ValueError("organization_id e product_id sao obrigatorios.")
    product = one(
        conn,
        "SELECT id FROM products WHERE organization_id = ? AND id = ?",
        (organization_id, product_id),
    )
    if not product:
        raise ValueError("Produto nao encontrado.")
    before_row = one(
        conn,
        """
        SELECT identifier_value, source_system
        FROM product_identifiers
        WHERE organization_id = ? AND product_id = ? AND identifier_type = 'supplier_reference'
        """,
        (organization_id, product_id),
    )
    before_value = before_row["identifier_value"] if before_row else ""
    conn.execute(
        """
        DELETE FROM product_identifiers
        WHERE organization_id = ? AND product_id = ? AND identifier_type = 'supplier_reference'
        """,
        (organization_id, product_id),
    )
    if value:
        conn.execute(
            """
            INSERT INTO product_identifiers
                (organization_id, product_id, identifier_type, identifier_value, source_system)
            VALUES (?, ?, 'supplier_reference', ?, 'manual')
            """,
            (organization_id, product_id, value),
        )
    conn.execute(
        """
        INSERT INTO audit_log
            (organization_id, action, target_type, target_id, before_json, after_json)
        VALUES (?, 'product_supplier_reference_update', 'product', ?, ?, ?)
        """,
        (
            organization_id,
            product_id,
            json.dumps({"supplier_reference": before_value}, ensure_ascii=False),
            json.dumps({"supplier_reference": value}, ensure_ascii=False),
        ),
    )
    conn.commit()
    return {"ok": True, "supplier_reference": value}


def update_product_purchase_settings(conn: sqlite3.Connection, payload: dict) -> dict:
    organization_id = scalar_text(payload.get("organization_id"))
    product_id = scalar_text(payload.get("product_id"))
    package_size = parse_decimal(payload.get("package_size"), None)
    target_coverage_days_provided = "target_coverage_days" in payload
    target_coverage_days = parse_int(payload.get("target_coverage_days"), None)
    if not organization_id or not product_id:
        raise ValueError("organization_id e product_id sao obrigatorios.")
    if package_size is None or package_size <= 0:
        raise ValueError("Itens por caixa deve ser maior que zero.")
    if target_coverage_days_provided and (target_coverage_days is None or target_coverage_days <= 0):
        raise ValueError("Cobertura alvo deve ser maior que zero.")
    product = one(
        conn,
        "SELECT id FROM products WHERE organization_id = ? AND id = ?",
        (organization_id, product_id),
    )
    if not product:
        raise ValueError("Produto nao encontrado.")
    before = one(
        conn,
        """
        SELECT package_size, target_coverage_days
        FROM product_settings
        WHERE organization_id = ? AND product_id = ?
        """,
        (organization_id, product_id),
    )
    if target_coverage_days_provided:
        conn.execute(
            """
            INSERT INTO product_settings
                (organization_id, product_id, package_size, target_coverage_days)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(organization_id, product_id) DO UPDATE SET
                package_size = excluded.package_size,
                target_coverage_days = excluded.target_coverage_days
            """,
            (organization_id, product_id, float(package_size), int(target_coverage_days)),
        )
    else:
        conn.execute(
            """
            INSERT INTO product_settings
                (organization_id, product_id, package_size)
            VALUES (?, ?, ?)
            ON CONFLICT(organization_id, product_id) DO UPDATE SET
                package_size = excluded.package_size
            """,
            (organization_id, product_id, float(package_size)),
        )
    after = one(
        conn,
        """
        SELECT package_size, target_coverage_days
        FROM product_settings
        WHERE organization_id = ? AND product_id = ?
        """,
        (organization_id, product_id),
    )
    conn.execute(
        """
        INSERT INTO audit_log
            (organization_id, action, target_type, target_id, before_json, after_json)
        VALUES (?, 'product_purchase_settings_update', 'product', ?, ?, ?)
        """,
        (
            organization_id,
            product_id,
            json.dumps(before or {}, ensure_ascii=False),
            json.dumps(after or {}, ensure_ascii=False),
        ),
    )
    conn.commit()
    return {"ok": True, "settings": dict(after)}
