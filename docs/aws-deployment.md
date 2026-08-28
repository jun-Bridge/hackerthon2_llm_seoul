# UniVoice — AWS 배포 가이드 (실제 배포 반영)

_2026-08-28 · 상태: 실배포 완료 반영_

**실제로 우리가 어떻게 EC2에 올렸는지**를 정리한 문서다. 처음 계획은 RDS·ElastiCache 같은
관리형 서비스를 쓰는 것이었으나(§9 참고), 대회 데모 범위에서는 **EC2 한 대에 PostgreSQL·Redis를
직접 설치**하는 쪽이 빠르고 단순해 그렇게 배포했다. 이 문서는 그 실제 구성을 따른다.

- 애플리케이션이 **무엇을 하는지**는 `.kiro/specs/complaint-assistant/`.
- 서버 안쪽 구조는 `docs/backend-design.md`.
- 이 문서는 **그 코드를 실제 EC2 위에 어떻게 얹었고, 어떻게 재배포하는지**를 다룬다.

---

## 0. 실제 구성 한 장 요약

| 조각 | 어디서 도나 | 비고 |
|---|---|---|
| **FastAPI 백엔드 + 정적 프론트** | EC2 위 uvicorn (systemd `univoice`, 워커 2개, 8501) | 같은 서버가 프론트 `dist`도 서빙 → CORS 없음 |
| **PostgreSQL** | **EC2에 직접 설치** (`postgresql` 서비스) | RDS 아님. `127.0.0.1:5432` |
| **Redis** | **EC2에 직접 설치** (`redis-server` 서비스) | ElastiCache 아님. `127.0.0.1:6379` |
| **LLM** | Amazon Bedrock (`global.anthropic.claude-sonnet-5`) | EC2 IAM 역할로 인증. 리전 `ap-northeast-2` |
| **정적 프론트** | EC2가 8501로 함께 서빙 | `src/backend/frontend/dist` |

```
        브라우저
           │  http://<EC2 공인 IP>:8501
           ▼
   ┌────────────────────────────────┐
   │              EC2                │  (Ubuntu, user: ubuntu)
   │  uvicorn (systemd: univoice)    │
   │  FastAPI + 정적 프론트(dist)      │
   │  ├ PostgreSQL (로컬 5432)         │
   │  └ Redis      (로컬 6379)         │
   └───────────────┬────────────────┘
                   │  IAM 역할(인스턴스 프로파일)
                   ▼
             ┌───────────┐
             │  Bedrock  │  (ap-northeast-2, Claude)
             └───────────┘
```

**접속 정보**
- SSH: `ssh -i hackathon-E1-T01-key.pem ubuntu@<EC2 공인 IP>` (유저는 **ubuntu**)
- 공인 IP는 재부팅 시 바뀔 수 있다 (과거 43.203.182.4 → 3.38.151.165 로 변경된 이력).
- 코드 위치: `/home/ubuntu/univoice/src/backend`
- pem 키: `connectionTest/hackathon-E1-T01-key.pem`

---

## 1. 각 조각이 뭐 하는 건지 (모르는 사람을 위해)

### EC2 (Elastic Compute Cloud)
클라우드의 리눅스 컴퓨터 한 대. SSH로 접속해 코드를 올리고 uvicorn을 띄운다.
대회가 팀에 EC2 한 대와 접속 키(`hackathon-E1-T01-key.pem`)를 배정했다. OS는 Ubuntu, 유저는 `ubuntu`.

### PostgreSQL (EC2 로컬 설치)
확정 데이터(계정·민원·대화·코멘트)를 담는 관계형 DB. 관리형(RDS)이 아니라 EC2 안에 직접
설치했고, 앱은 `127.0.0.1:5432`로 붙는다. `init_db.py`가 8개 테이블을 만들고 `seed_schools.py`가
학교·도메인·관리자 코드를 시드한다.

### Redis (EC2 로컬 설치)
로그인 세션·턴 잠금·압축 잠금·칩 캐시가 산다. 역시 EC2 안에 직접 설치했고 `127.0.0.1:6379`.

### Bedrock
AWS가 제공하는 LLM API. 모델 서버를 우리가 띄우지 않고 `boto3`로 호출만 한다.
대회가 `global.anthropic.claude-sonnet-5`를 지정했다. **자격증명은 EC2에 붙은 IAM 역할이
자동 처리**하고(코드에 키 없음), `llm/client.py`가 리전을 `ap-northeast-2`로 명시한다.

### IAM 역할 / 인스턴스 프로파일
"이 EC2가 Bedrock을 불러도 된다"는 허가증. EC2에 붙은 역할(`hackathon-e1-t01-ec2-role`)로
그 안에서 도는 코드가 자동으로 권한을 갖는다.

### 보안 그룹 (Security Group)
방화벽. 8501(웹)과 22(SSH)를 외부에 연다. PostgreSQL·Redis는 로컬 전용이라 외부에 열지 않는다.

---

## 2. 왜 EC2에 DB·Redis를 직접 설치했나 (실제 판단)

- **데모 범위에서 가장 빠르고 단순하다.** 관리형(RDS·ElastiCache)은 VPC·서브넷·보안 그룹을 맞춰야
  붙는데, 단일 인스턴스 데모에서는 로컬 설치가 프로세스 몇 개로 끝난다.
- **코드 변경이 없다.** 앱은 `DATABASE_URL`·`REDIS_URL` 환경변수만 본다. 지금은 `localhost`를
  가리키고, 나중에 관리형으로 옮기려면 이 두 값만 엔드포인트로 바꾸면 된다(§9).
- **Bedrock 자격증명을 코드에 안 넣는다.** EC2 인스턴스 프로파일이 자동으로 준다. 키를 하드코딩하면
  깃에 새고, 리전이 배정 리전과 다르면 `AccessDenied`가 난다.
- **프론트를 별도 서비스로 안 뺀다.** EC2가 정적 파일까지 함께 서빙하면 프로세스 하나로 끝나고
  CORS도 없다.

---

## 3. 환경변수 — 무엇을 어디에 두나

`src/backend/.env` (권한 600, git 제외). **키는 아래 4개뿐이다.**

```dotenv
DATABASE_URL=postgresql://<사용자>:<비밀번호>@localhost:5432/univoice
REDIS_URL=redis://localhost:6379/0
LLM_MODEL_ID=global.anthropic.claude-sonnet-5
PORT=8501
```

> **주의: `AWS_REGION` 같은 키를 `.env`에 넣지 않는다.** `core/config.py`의 pydantic Settings가
> `extra_forbidden`이라 정의되지 않은 키가 있으면 앱이 기동 시 에러로 죽는다. 리전은 코드
> (`llm/client.py`)가 `ap-northeast-2`로 갖고 있고, Bedrock 자격증명은 IAM 역할이 처리하므로
> `.env`에 AWS 관련 키가 필요 없다.

---

## 4. 최초 환경 구축 (한 번만)

이미 구축돼 있다면 §6(재배포)만 보면 된다. 처음부터 세우는 경우:

### 4.1 접속
```bash
ssh -i hackathon-E1-T01-key.pem ubuntu@<EC2_공인_IP>
```

### 4.2 PostgreSQL·Redis 설치
```bash
sudo apt update
sudo apt install -y postgresql redis-server python3-venv
sudo systemctl enable --now postgresql redis-server

# DB·사용자 생성 (예시 — 실제 비밀번호는 본인이 정한다)
sudo -u postgres psql -c "CREATE DATABASE univoice;"
sudo -u postgres psql -c "CREATE USER univoice_app WITH PASSWORD '<비밀번호>';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE univoice TO univoice_app;"
```

### 4.3 코드 배치 + 의존성
```bash
git clone <저장소_URL> ~/univoice
cd ~/univoice/src/backend
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
```

### 4.4 .env 작성 (§3의 4개 키)
```bash
cat > ~/univoice/src/backend/.env <<'EOF'
DATABASE_URL=postgresql://univoice_app:<비밀번호>@localhost:5432/univoice
REDIS_URL=redis://localhost:6379/0
LLM_MODEL_ID=global.anthropic.claude-sonnet-5
PORT=8501
EOF
chmod 600 ~/univoice/src/backend/.env
```

### 4.5 스키마 생성 + 시드 (재실행 안전)
```bash
cd ~/univoice/src/backend
set -a; . ./.env; set +a
./.venv/bin/python init_db.py        # 8개 테이블 + 인덱스 (IF NOT EXISTS)
./.venv/bin/python seed_schools.py   # 학교·도메인·관리자 코드 (ON CONFLICT)
```

### 4.6 프론트 빌드 산출물 배치
프론트는 로컬에서 `npm run build`로 만든 `dist/`를 EC2의
`~/univoice/src/backend/frontend/dist`에 올린다(§6.3에 재배포 절차).

### 4.7 systemd 등록
`/etc/systemd/system/univoice.service` (실제 등록된 내용):
```ini
[Unit]
Description=UniVoice FastAPI (uvicorn)
After=network.target postgresql.service redis-server.service

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/univoice/src/backend
EnvironmentFile=/home/ubuntu/univoice/src/backend/.env
ExecStart=/home/ubuntu/univoice/src/backend/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8501 --workers 2
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now univoice
```

### 4.8 확인
```bash
curl -s http://localhost:8501/health
# {"status":"ok","db":true,"redis":true,"bedrock":true}
```
`/health`는 계층별 상태를 돌려준다. 한 계층이 죽어도 200(degraded)로 응답해 어디가 문제인지 보인다.

---

## 5. Bedrock이 되는지 확인

```bash
# EC2에서 (IAM 역할이 자동 인증)
cd ~/univoice/src/backend
./.venv/bin/python -c "import boto3; print(boto3.client('bedrock-runtime', region_name='ap-northeast-2').meta.region_name)"
```
- `AccessDenied` → IAM 역할에 `bedrock:InvokeModel` 권한이 없거나 리전이 배정 리전과 다름.
- `on-demand throughput isn't supported` → raw 모델 id를 씀. `global.` 프로필 id를 써야 함.
- `/health`의 `"bedrock":true`가 실제 소형 호출로 확인된 값이다.

---

## 6. 재배포 절차 (코드 수정 후) — 실제로 쓰는 방법

SSH로 원격 bash에 따옴표가 많이 섞이면 이스케이프가 깨지기 쉽다. **rm과 scp/추출을 분리**하고
짧게 실행하는 편이 안정적이다.

### 6.1 백엔드 파일 몇 개 교체
```powershell
# 로컬(Windows PowerShell)에서
$pem="...\connectionTest\hackathon-E1-T01-key.pem"
scp -i $pem src\backend\app\...\changed.py ubuntu@<IP>:/tmp/
ssh -i $pem ubuntu@<IP> "mv /tmp/changed.py ~/univoice/src/backend/app/.../changed.py"
ssh -i $pem ubuntu@<IP> "sudo systemctl restart univoice"
```

### 6.2 스키마·시드 변경 시
```bash
cd ~/univoice/src/backend
set -a; . ./.env; set +a
./.venv/bin/python init_db.py       # IF NOT EXISTS라 안전
./.venv/bin/python seed_schools.py  # ON CONFLICT라 중복 안 쌓임
sudo systemctl restart univoice
```

### 6.3 프론트 재배포 (dist 교체)
```powershell
# 로컬: 빌드 후 tar로 묶어 한 번에 올린다
cd src\frontend
npm run build
tar -czf dist.tgz -C dist .
scp -i $pem dist.tgz ubuntu@<IP>:/tmp/dist.tgz
# 원격: 기존 dist 비우고 추출 (rm/추출 분리)
ssh -i $pem ubuntu@<IP> "rm -rf ~/univoice/src/backend/frontend/dist; mkdir -p ~/univoice/src/backend/frontend/dist"
ssh -i $pem ubuntu@<IP> "tar -xzf /tmp/dist.tgz -C ~/univoice/src/backend/frontend/dist"
ssh -i $pem ubuntu@<IP> "sudo systemctl restart univoice"
```
> tar 추출 시 `Ignoring unknown extended header keyword 'SCHILY.fflags'` 경고는 무해하다(Windows tar).

### 6.4 배포 확인
```powershell
curl.exe -s http://<IP>:8501/health           # 4계층 ok
curl.exe -s http://<IP>:8501/                  # index.html 이 최신 번들 해시를 참조하는지
```

---

## 7. 운영 명령 요약

```bash
sudo systemctl restart univoice      # 재시작
sudo systemctl status univoice       # 상태
journalctl -u univoice -n 100 --no-pager   # 최근 로그
journalctl -u univoice -f            # 실시간 로그
```

- 재부팅해도 `enable`돼 있어 자동 기동한다. PostgreSQL·Redis도 `enable` 상태.
- Python 3.14 환경에서 임시 스크립트가 `close_pool()`을 호출하지 않으면 종료 시
  `PythonFinalizationError`가 날 수 있다 — 스크립트는 끝에 `pool.close_pool()`을 부른다.

---

## 8. Docker를 써야 하나? — 안 썼다

**결론: 안 썼고, 데모엔 불필요하다.** EC2에서 uvicorn을 직접(systemd) 돌리는 게 가장 단순했다.
`docker/`는 로컬 통합 개발용으로만 남겨 둔다. 규모가 커져 여러 대로 확장할 때 ECS/Fargate를
고려한다.

---

## 9. 나중에 다듬을 것 (데모 이후)

- **관리형 DB/캐시로 이전**: 안정성이 필요하면 로컬 PostgreSQL·Redis를 RDS·ElastiCache로 옮긴다.
  코드 변경 없이 `.env`의 `DATABASE_URL`·`REDIS_URL`만 엔드포인트로 바꾸면 된다. (EC2가 죽으면
  로컬 설치는 데이터가 함께 죽고 백업이 없다 — 관리형은 AWS가 백업·복구를 맡는다.)
- **HTTPS**: 지금은 EC2 IP로 http라 쿠키에 `Secure`를 못 단다(`SameSite=Lax`로 감수).
  도메인 + ACM 인증서 + ALB를 붙이면 https가 되고, 그때 쿠키를 `Secure`로 올린다.
- **고정 IP**: 재부팅 시 공인 IP가 바뀌므로 Elastic IP를 붙이면 주소가 고정된다.
- **비밀번호 관리**: `.env` → AWS Secrets Manager / SSM Parameter Store.
- **정적 프론트 분리**: 트래픽이 커지면 프론트를 S3 + CloudFront로 빼고 EC2는 API만.
- **백업**: 로컬 PostgreSQL은 `pg_dump` cron. 관리형으로 옮기면 자동 백업.

---

## 10. 자주 막히는 곳

| 증상 | 원인 / 해결 |
|---|---|
| 앱이 기동하자마자 죽음 | `.env`에 정의 안 된 키(예: `AWS_REGION`) — pydantic `extra_forbidden`. 4개 키만 둔다(§3) |
| `/health`에서 `"db":false` | PostgreSQL 미기동 또는 `DATABASE_URL` 오타. `systemctl status postgresql` |
| `/health`에서 `"redis":false` | `redis-server` 미기동 또는 `REDIS_URL` 오타 |
| Bedrock `AccessDenied` | IAM 역할 권한 없음 또는 리전 불일치(`ap-northeast-2` 확인) |
| Bedrock `on-demand throughput isn't supported` | raw 모델 id. `global.` 프로필 id를 써야 함 |
| 채팅에서 간헐 502 | 모델 응답이 max_tokens로 잘려 tool_use 누락. `llm/client.py`의 `_REFINE_MAX_TOKENS` 상향으로 완화 |
| 8501이 브라우저에서 안 열림 | 보안 그룹 인바운드에 8501 없음 |
| 재부팅하니 IP가 바뀜 | 공인 IP는 고정이 아니다. Elastic IP를 붙이거나 새 IP로 접속(§9) |
| 프론트가 옛 화면 | dist 재배포 안 됨 또는 브라우저 캐시. index.html의 번들 해시로 확인(§6.4) |
