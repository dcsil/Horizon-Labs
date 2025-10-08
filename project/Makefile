.PHONY: dev fe be test fe-install be-install

dev: fe-install be-install
	@cd frontend && npm install -j 2 fe be

fe:
	cd frontend && npm run dev

be:
	cd backend && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

test:
	cd frontend && npm run test
	cd backend && pytest -q

fe-install:
	cd frontend && npm install

be-install:
	cd backend && pip install -r requirements.txt
