from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
NEXO_SKILLS_DIR = ROOT / "nexo_skills"


def load_json_file(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def load_nexo_skills() -> dict:
    manifest = load_json_file(NEXO_SKILLS_DIR / "manifest.json")
    loaded = []
    for item in manifest.get("skills", []):
        skill = load_json_file(NEXO_SKILLS_DIR / item.get("file", ""))
        if skill:
            loaded.append({**item, "content": skill})
    return {**manifest, "skills": loaded}


def action_rules() -> dict:
    return load_json_file(NEXO_SKILLS_DIR / "action_center.json").get("actions", {})


def action_rules_version() -> str:
    return load_json_file(NEXO_SKILLS_DIR / "action_center.json").get("version", "")


def nexo_skill_name(skill_id: str) -> str:
    for item in load_nexo_skills().get("skills", []):
        if item.get("id") == skill_id:
            return item.get("name") or skill_id
    return skill_id.replace("_", " ").title()


class SafeTemplateData(dict):
    def __missing__(self, key: str) -> str:
        return "{" + key + "}"


def render_skill_template(template: str, context: dict) -> str:
    values = SafeTemplateData({key: "" if value is None else value for key, value in context.items()})
    return (template or "").format_map(values)


def api_nexo_skills() -> dict:
    skills = load_nexo_skills()
    return {
        "schema_version": skills.get("schema_version"),
        "product": skills.get("product"),
        "description": skills.get("description"),
        "skills": [
            {
                "id": item.get("id"),
                "version": item.get("version"),
                "name": item.get("name"),
                "purpose": item.get("content", {}).get("purpose", ""),
                "principles": item.get("content", {}).get("principles", []),
                "inputs": item.get("content", {}).get("inputs", []),
                "outputs": item.get("content", {}).get("outputs", []),
                "guardrails": item.get("content", {}).get("guardrails", []),
            }
            for item in skills.get("skills", [])
        ],
        "action_rules": [
            {
                "id": key,
                "skill_id": rule.get("skill_id"),
                "title": rule.get("title"),
                "priority": rule.get("priority"),
                "view": rule.get("view"),
            }
            for key, rule in action_rules().items()
        ],
    }
