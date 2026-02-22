from fastapi import APIRouter, Depends
from app.core.deps import require_role

router = APIRouter()

META = {
  "quotes": [
    {"field_name": "author", "label": "Автор", "type": "string", "required": True, "read_only": False, "editable_roles": ["ADMIN"]},
    {"field_name": "text", "label": "Цитата", "type": "text", "required": True, "read_only": False, "editable_roles": ["ADMIN"]},
    {"field_name": "source", "label": "Источник", "type": "string", "required": False, "read_only": False, "editable_roles": ["ADMIN"]},
    {"field_name": "is_active", "label": "Активна", "type": "boolean", "required": False, "read_only": False, "editable_roles": ["ADMIN"]},
    {"field_name": "sort_order", "label": "Порядок", "type": "number", "required": False, "read_only": False, "editable_roles": ["ADMIN"]},
  ]
}

@router.get("/{entity}")
def get_entity_meta(entity: str, admin=Depends(require_role("ADMIN","LAWYER"))):
    return {"entity": entity, "fields": META.get(entity, [])}
