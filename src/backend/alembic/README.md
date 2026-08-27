# alembic/ — DB 마이그레이션

구현 예정
- `env.py` — `core/config.py`의 설정을 읽어 접속. URL을 여기 하드코딩하지 않는다.
- `versions/` — 마이그레이션 리비전

모델(`app/db/postgres/models/`)을 바꾸면 반드시 리비전을 만든다. 손으로 스키마를 고치지 않는다.
```
alembic revision --autogenerate -m "..."
alembic upgrade head
```
