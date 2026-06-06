from fastapi import FastAPI

def create_app(lifespan) -> FastAPI:
    from .routers import note, provider, model, config, chat, flashcard
    from .utils.response import ResponseWrapper as R

    app = FastAPI(title="VideoMemo",lifespan=lifespan)

    @app.get("/sys_check")
    async def root_sys_check():
        return R.success()

    app.include_router(note.router, prefix="/api")
    app.include_router(provider.router, prefix="/api")
    app.include_router(model.router,prefix="/api")
    app.include_router(config.router,  prefix="/api")
    app.include_router(chat.router, prefix="/api")
    app.include_router(flashcard.router, prefix="/api")

    return app
