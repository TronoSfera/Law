from app.workers.celery_app import celery_app

@celery_app.task(name='app.workers.tasks.uploads.cleanup_stale_uploads')
def cleanup_stale_uploads():
    return 'ok'
