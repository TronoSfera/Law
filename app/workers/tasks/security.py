from app.workers.celery_app import celery_app

@celery_app.task(name='app.workers.tasks.security.cleanup_expired_otps')
def cleanup_expired_otps():
    return 'ok'
