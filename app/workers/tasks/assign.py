from app.workers.celery_app import celery_app

@celery_app.task(name='app.workers.tasks.assign.auto_assign_unclaimed')
def auto_assign_unclaimed():
    return 'ok'
