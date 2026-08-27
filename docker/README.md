# docker/ — 로컬 개발 컨테이너

**로컬 개발 전용.** AWS 배포 정의는 여기 두지 않는다(Kiro IDE 담당).

구현 예정
- `compose.dev.yml` — postgres · redis · backend · frontend 를 한 번에 띄운다
- `backend.Dockerfile` — python + uvicorn
- `frontend.Dockerfile` — node 빌드 → 정적 서빙 (dev는 vite 서버)

LLM(gpt-oss-120b)은 이 compose에 넣지 않는다. GPU 호스트에서 따로 뜨고, `.env`의 `LLM_BASE_URL`로 가리킨다.
