run:
	docker compose up --build

migrate:
	docker compose exec backend alembic upgrade head

test:
	docker compose exec backend python -m unittest discover -s tests -p "test_*.py" -v
