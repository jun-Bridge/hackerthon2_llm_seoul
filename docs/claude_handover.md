# EC2 운영·배포 이관 문서 (Claude Code / 담당자용)

_2026-08-28 · 대상: EC2에 접근해 빌드·배포·검증을 직접 수행할 담당자_

이 문서 하나로 **EC2 접속 → 코드 반영 → 빌드 → 재시작 → 검증**을 전부 할 수 있게 만든 실무 지침이다.
설계·계약은 다른 문서에 있고, 여기는 **"손으로 무엇을 어떤 순서로 치는가"**만 다룬다.

- 배포 구조 근거: `docs/aws-deployment.md`
- 서버 내부 구조: `docs/backend-design.md`
- HTTP 계약: `docs/api-contract.md`

---

## 0. 한 눈에

| 항목 | 값 |
|---|---|
| 서버 | AWS EC2 (Ubuntu), 단일 인스턴스 |
| SSH 유저 | **`ubuntu`** (ec2-user 아님) |
| 공인 IP | **가변** — 재부팅 시 바뀜 (예: 43.203.182.4 → 3.38.151.165). 접속 전 최신 IP 확인 필요 |
| 접속 키 | `connectionTest/hackathon-E1-T01-key.pem` |
| 코드 위치 | `/home/ubuntu/univoice/src/backend` |
| 프론트 산출물 | `/home/ubuntu/univoice/src/backend/frontend/dist` (백엔드가 8501로 함께 서빙) |
| 서비스 | systemd `univoice` (uvicorn, `--workers 2`, 포트 8501) |
| DB / 캐시 | **EC2에 직접 설치** — PostgreSQL(로컬 5432) · Redis(로컬 6379). RDS/ElastiCache 아님 |
| LLM | Amazon Bedrock `global.anthropic.claude-sonnet-5`, 리전 `ap-northeast-2`, IAM 역할 인증 |
| Python | EC2는 3.14 계열 (스크립트에서 `close_pool()` 안 하면 종료 시 PythonFinalizationError) |

접속:
```bash
ssh -i connectionTest/hackathon-E1-T01-key.pem ubuntu@<현재_공인_IP>
```

---

## 1. 반드시 지킬 함정 (여기서 사고가 난다)

1. **`.env`에 정의 안 된 키를 넣지 마라.** pydantic Settings가 `extra_forbidden`이라 `.env` 파일에
   `AWS_REGION` 같은 키가 있으면 **앱이 기동 즉시 죽는다.** 허용 키는 4개뿐:
   `DATABASE_URL`, `REDIS_URL`, `LLM_MODEL_ID`, `PORT`. (리전은 코드에 `ap-northeast-2` 고정)
2. **SSH 원격 명령의 따옴표 이스케이프가 잘 깨진다.** 복잡한 bash는 스크립트 파일로 만들어 `scp` 후
   `ssh`로 실행하는 게 안정적이다.
3. **`scp -r` 직후 다른 명령을 체이닝하면 타임아웃 난다.** `rm`과 `scp`/추출을 **분리**해 짧게 실행.
4. **tar 추출 시 `Ignoring unknown extended header keyword 'SCHILY.fflags'` 경고는 무해**하다
   (Windows tar 산출물). 실패로 오해하지 말 것.
5. **공인 IP는 고정이 아니다.** 접속 안 되면 죽은 게 아니라 IP가 바뀐 것일 수 있다 — 콘솔에서 최신 IP 확인.
6. **콘솔 한글이 깨져 보여도 서버는 UTF-8 정상**이다. 인코딩 표시 문제일 뿐.
7. **임시 스크립트는 `connectionTest/`에 만들고 작업 후 삭제**한다. `.vscode/`는 커밋하지 않는다.

---

## 2. 백엔드 코드 반영 (파일 몇 개 교체)

로컬(Windows PowerShell) 기준. `$pem`을 먼저 잡아둔다.

```powershell
$pem = "C:\...\connectionTest\hackathon-E1-T01-key.pem"
$IP  = "<현재_공인_IP>"

# 1) 업로드 (여러 개 한 번에 OK). 같은 파일명이 여럿이면 /tmp에서 덮어쓰니 이름을 구분해 올린다.
scp -i $pem -o StrictHostKeyChecking=no `
  src\backend\app\llm\client.py `
  src\backend\app\services\session_service.py `
  ubuntu@${IP}:/tmp/

# 2) 제자리로 이동 (rm/이동은 짧게 분리)
ssh -i $pem -o StrictHostKeyChecking=no ubuntu@$IP `
  "mv /tmp/client.py ~/univoice/src/backend/app/llm/client.py; mv /tmp/session_service.py ~/univoice/src/backend/app/services/session_service.py; echo MOVED"

# 3) 재시작
ssh -i $pem -o StrictHostKeyChecking=no ubuntu@$IP "sudo systemctl restart univoice"
```

> **주의**: `schemas/session.py`와 `routes/session.py`처럼 **파일명이 같으면** `/tmp/session.py`에서
> 서로 덮어쓴다. `scp ... ubuntu@IP:/tmp/schemas_session.py` 처럼 **다른 이름으로 올린 뒤** 각각 이동한다.

의존성이 추가됐다면(requirements.txt 변경):
```powershell
scp -i $pem src\backend\requirements.txt ubuntu@${IP}:/tmp/requirements.txt
ssh -i $pem ubuntu@$IP "mv /tmp/requirements.txt ~/univoice/src/backend/requirements.txt; cd ~/univoice/src/backend; ./.venv/bin/pip install -r requirements.txt"
```

---

## 3. 프론트 빌드 & 배포 (dist 교체)

프론트는 **Vite + React**다. 로컬에서 빌드해 산출물(`dist/`)만 EC2로 올린다. EC2에서 npm 빌드를 돌리지 않는다.

```powershell
# 1) 로컬 빌드
cd src\frontend
npm install          # 최초 1회 또는 의존성 변경 시
npm run build        # → dist/ 생성 (해시 붙은 index-*.js / index-*.css)

# 2) tar로 묶어 한 번에 업로드
tar -czf dist.tgz -C dist .
scp -i $pem -o StrictHostKeyChecking=no dist.tgz ubuntu@${IP}:/tmp/dist.tgz

# 3) EC2에서 기존 dist 비우고 추출 (rm/추출 분리!)
ssh -i $pem -o StrictHostKeyChecking=no ubuntu@$IP "rm -rf ~/univoice/src/backend/frontend/dist; mkdir -p ~/univoice/src/backend/frontend/dist"
ssh -i $pem -o StrictHostKeyChecking=no ubuntu@$IP "tar -xzf /tmp/dist.tgz -C ~/univoice/src/backend/frontend/dist"

# 4) 재시작 + 정리
ssh -i $pem -o StrictHostKeyChecking=no ubuntu@$IP "sudo systemctl restart univoice; rm -f /tmp/dist.tgz"
Remove-Item dist.tgz
```

> 정적 파일은 uvicorn 재시작 없이도 반영되지만, 캐시/일관성을 위해 재시작을 권장한다.
> SCHILY 경고는 무시(§1-4).

---

## 4. 스키마 / 시드 변경 (DB)

`init_db.py`는 `IF NOT EXISTS`, `seed_schools.py`는 `ON CONFLICT`라 **여러 번 돌려도 안전**하다.

```bash
# EC2에서
cd ~/univoice/src/backend
set -a; . ./.env; set +a          # .env 로드 (DATABASE_URL 등)
./.venv/bin/python init_db.py      # 8개 테이블 + 인덱스
./.venv/bin/python seed_schools.py # 학교·도메인·관리자 코드
sudo systemctl restart univoice
```

> **직접 만든 임시 파이썬 스크립트는 반드시 끝에 `pool.close_pool()`을 호출**한다.
> EC2 Python 3.14에서 안 하면 종료 시 `PythonFinalizationError`가 난다.

---

## 5. 배포 검증

```bash
# 계층별 상태 (한 층 죽어도 200 + degraded)
curl -s http://<IP>:8501/health
# {"status":"ok","db":true,"redis":true,"bedrock":true}

# 서빙 중인 번들 해시 확인 (프론트가 최신인지)
curl -s http://<IP>:8501/ | grep index-
```

- `"db":false` → PostgreSQL 미기동/URL 오타. `sudo systemctl status postgresql`
- `"redis":false` → Redis 미기동/URL 오타. `sudo systemctl status redis-server`
- `"bedrock":false` → IAM 권한 또는 리전(ap-northeast-2). `list_foundation_models` 도달 실패
- 페이지가 옛 화면 → dist 재배포 안 됐거나 브라우저 캐시. index.html의 번들 해시로 확인

---

## 6. 운영/디버깅 명령

```bash
sudo systemctl restart univoice            # 재시작
sudo systemctl status univoice             # 상태
journalctl -u univoice -n 100 --no-pager   # 최근 로그
journalctl -u univoice -f                  # 실시간 로그
```

- 재부팅 자동기동: univoice·postgresql·redis-server 모두 `enable` 상태.
- LLM 관련 문제(간헐 502 등)는 `bedrock_logs` 테이블의 `error` 컬럼을 조회하면 원인이 보인다
  (실패 사유가 여기 남는다 — 앱 로그에는 안전 메시지로만 뜬다).

---

## 7. 실 서버에서 E2E로 검증하는 법 (프론트 없이)

쿠키 세션 기반이라 `http.cookiejar`로 로그인 상태를 유지해 API를 직접 때린다. 모든 API는 `/api` prefix.

```python
# connectionTest/ 에 임시 스크립트로 저장해 로컬에서 실행
import http.cookiejar, json, urllib.request
BASE = "http://<IP>:8501/api"
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def req(m, p, body=None):
    r = urllib.request.Request(BASE+p, data=json.dumps(body).encode() if body else None, method=m)
    r.add_header("Content-Type", "application/json"); r.add_header("X-Requested-With", "fetch")
    try:
        with op.open(r, timeout=90) as resp: return resp.status, json.loads(resp.read() or "{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or "{}")

# 학생 가입(조선대 도메인) → 세션 생성 → 메시지 → 접수 …
```

- 학생 계정: 도메인만 맞추면 됨 (예: `@chosun.ac.kr`).
- 관리자 계정: `admin_code` 필요. 조선대 = `CHOSUN-ADMIN-2026` (학교별 코드는 `seed_schools.py` 참조).
- 시드 학교: 조선대(chosun.ac.kr)·순천대(sunchon.ac.kr)·군산대(kunsan.ac.kr)·전남대(jnu.ac.kr)·전북대(jbnu.ac.kr).
- Bedrock 호출은 턴당 수 초 걸린다 — 타임아웃을 넉넉히(60~90s).

---

## 8. git 흐름

- 원격: `https://github.com/jun-Bridge/hackerthon2_llm_seoul.git`, 브랜치 `main` (credential manager로 push).
- `git pull --rebase origin main` → 작업 → `git add <파일>`(.vscode 제외) → `git commit` → `git push origin main`.
- push/pull이 인터랙티브(자격증명)로 멈추면 백그라운드 실행 후 로그 파일로 결과를 확인한다.
- **커밋/푸시는 명시적 지시가 있을 때만.**

---

## 9. 자주 하는 전체 배포 (요약 순서)

```
[백엔드 변경]                          [프론트 변경]
1. scp 파일 → /tmp                     1. npm run build (로컬)
2. ssh mv → 제자리                     2. tar -czf dist.tgz -C dist .
3. (의존성 시) pip install             3. scp dist.tgz → /tmp
4. sudo systemctl restart univoice     4. ssh: rm -rf dist; mkdir; tar -xzf
5. curl /health 확인                   5. sudo systemctl restart univoice
                                       6. curl / | grep index- 로 번들 확인
```
