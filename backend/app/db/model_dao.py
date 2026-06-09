from app.db.engine import get_db
from app.db.models.models import Model
from app.db.models.providers import Provider


def _serialize_model(model: Model):
    created_at = getattr(model, "created_at", None)
    return {
        "id": model.id,
        "provider_id": model.provider_id,
        "model_name": model.model_name,
        "supports_multimodal": bool(getattr(model, "supports_multimodal", False)),
        "created_at": created_at.isoformat() if created_at else None,
    }


def get_model_by_provider_and_name(provider_id: int, model_name: str):
    db = next(get_db())
    try:
        model = db.query(Model).filter_by(provider_id=provider_id, model_name=model_name).first()
        if model:
            return _serialize_model(model)
        return None
    finally:
        db.close()


def insert_model(provider_id: int, model_name: str, supports_multimodal: bool = False):
    db = next(get_db())
    try:
        model = Model(
            provider_id=provider_id,
            model_name=model_name,
            supports_multimodal=bool(supports_multimodal),
        )
        db.add(model)
        db.commit()
        db.refresh(model)
        return _serialize_model(model)
    finally:
        db.close()


def get_models_by_provider(provider_id: int):
    db = next(get_db())
    try:
        models = db.query(Model).filter_by(provider_id=provider_id).all()
        return [_serialize_model(m) for m in models]
    finally:
        db.close()


def update_model_capabilities(model_id: int, supports_multimodal: bool):
    db = next(get_db())
    try:
        model = db.query(Model).filter_by(id=model_id).first()
        if not model:
            return None
        model.supports_multimodal = bool(supports_multimodal)
        db.commit()
        db.refresh(model)
        return _serialize_model(model)
    finally:
        db.close()


def delete_model(model_id: int):
    db = next(get_db())
    try:
        model = db.query(Model).filter_by(id=model_id).first()
        if model:
            db.delete(model)
            db.commit()
    finally:
        db.close()


def get_all_models():
    db = next(get_db())
    try:
        # 只查询启用状态供应商的模型
        models = db.query(Model).join(Provider, Model.provider_id == Provider.id).filter(Provider.enabled == 1).all()
        return [_serialize_model(m) for m in models]
    finally:
        db.close()
