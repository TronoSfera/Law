from app.workers.celery_app import celery_app

@celery_app.task(name='app.workers.tasks.sla.sla_check')
def sla_check():
    return 'ok'
