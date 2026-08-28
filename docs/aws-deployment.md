# UniVoice — AWS 배포 가이드

_2026-08-28 · 상태: 초안_

**"조립을 다 했다"는 가정 하에, 우리 서비스를 AWS에 어떻게 올릴지**를 정리한 문서다.
AWS를 처음 다루는 사람도 따라올 수 있게 **무엇이 무엇을 대신하는지**부터 짚는다.

- 애플리케이션이 **무엇을 하는지**는 `.kiro/specs/complaint-assistant/`.
- 서버 안쪽 구조는 `docs/backend-design.md`.
- 이 문서는 **그 코드를 실제 AWS 자원 위에 어떻게 얹는지**만 다룬다.

> **전제**: 이 저장소는 "애플리케이션 코드 + git"까지만 담당한다(README 경계). 실제 프로비저닝은
> 대회 환경(Kiro IDE / 팀에 배정된 EC2)에서 이뤄진다. 이 문서는 **그 위에서 우리가 무엇을
> 어떤 순서로 올릴지**를 사람이 읽고 실행할 수 있게 적은 것이다.

---

## 0. 한 장 요약

우리 서비스는 조각이 넷이다. 각각을 AWS의 무엇에 얹을지부터.

| 우리 조각 | 로컬(개발)에선 | AWS에선 | 왜 |
|---|---|---|---|
| **FastAPI 백엔드 + 정적 프론트** | 내 PC의 uvicorn | **EC2** 위 uvicorn | 상주하는 웹 서버 프로세스가 필요 |
| **PostgreSQL** (확정 데이터) | 로컬/도커 postgres | **RDS for PostgreSQL** | 관리형 DB — 백업·재시작을 AWS가 해줌 |
| **Redis** (세션·잠금) | 로컬/도커 redis | **ElastiCache for Redis** | 관리형 인메모리 저장소 |
| **LLM** (민원 정제) | — | **Amazon Bedrock** (`global.anthropic.claude-sonnet-5`) | 대회가 지정. 서버를 우리가 안 띄움 |
| **정적 프론트 파일** | vite dev 서버 | **EC2가 같은 8501로 서빙** | 동일 출처 → CORS 없음 |

**핵심 그림:**

```
        브라우저
           │  http://<EC2 공인 IP>:8501
           ▼
   ┌──────────────────┐
   │       EC2        │  ← 여기에 우리 코드가 산다 (uvicorn 워커 여러 개)
   │   FastAPI + 정적  │
   └───┬─────┬─────┬──┘
       │     │     │  ← EC2의 IAM 역할(인스턴스 프로파일)로 인증
   ┌───▼──┐ ┌▼────────┐ ┌▼──────────┐
   │ RDS  │ │ElastiCa.│ │  Bedrock  │
   │ (PG) │ │ (Redis) │ │  (Claude) │
   └──────┘ └─────────┘ └───────────┘
```

**결정 하나만 기억하면 된다**: DB와 Redis는 **AWS 관리형 서비스**(RDS·ElastiCache)를 쓰고,
우리 앱은 **EC2에서 직접 실행**한다. Docker 컨테이너로 감싸는 것은 선택이지 필수가 아니다(§8).

---

## 1. 각 AWS 서비스가 뭐 하는 건지 (모르는 사람을 위해)

### EC2 (Elastic Compute Cloud)
**클라우드에 있는 리눅스 컴퓨터 한 대.** SSH로 접속해서 우리 코드를 올리고 `uvicorn`을 띄운다.
로컬에서 `uvicorn app.main:app`을 돌리던 것을, 그냥 이 원격 컴퓨터에서 돌린다고 보면 된다.
대회는 팀에 EC2 한 대와 접속 키(`hackathon-e1-t01-key.pem`)를 이미 배정했다.

### RDS (Relational Database Service)
**AWS가 대신 운영해 주는 PostgreSQL.** 우리가 직접 postgres를 설치·백업·패치할 필요가 없다.
접속 주소(엔드포인트)·계정·비밀번호만 받아서 `DATABASE_URL`에 넣으면 끝. 우리 `init_db.py`가
그 주소로 붙어 테이블을 만든다.

### ElastiCache
**AWS가 운영해 주는 Redis.** 로그인 세션·턴 잠금·칩 캐시가 여기 산다. 역시 엔드포인트만 받아
`REDIS_URL`에 넣는다.

### Bedrock
**AWS가 제공하는 LLM API.** 우리가 모델 서버를 띄우지 않는다. `boto3`로 호출만 한다.
대회가 `global.anthropic.claude-sonnet-5`를 지정했고, **자격증명은 EC2에 붙은 IAM 역할이
자동으로 처리**한다(코드에 키를 넣지 않는다 — §4).

### IAM 역할 / 인스턴스 프로파일
**"이 EC2가 Bedrock을 불러도 된다"는 허가증.** EC2에 역할을 붙여두면, 그 안에서 도는 코드가
자동으로 그 권한을 갖는다. 그래서 `boto3.client('bedrock-runtime')`에 키를 안 줘도 된다.

### 보안 그룹 (Security Group)
**방화벽 규칙.** "8501 포트를 외부에 연다", "RDS의 5432는 EC2에서만 접근 허용" 같은 걸 정한다.

---

## 2. 왜 이렇게 나누나 (설계 근거)

- **DB·Redis를 EC2 안에 같이 설치하지 않는 이유**: 그래도 데모는 돌지만, EC2가 죽으면 데이터가
  같이 죽고 백업이 없다. RDS·ElastiCache는 AWS가 백업·복구를 맡아준다. 코드 변경은 0 —
  `DATABASE_URL`·`REDIS_URL` 환경변수만 관리형 엔드포인트로 바꾸면 그대로 붙는다.
- **Bedrock 자격증명을 코드에 안 넣는 이유**: `connectionTest/bedrock_simple_test.py`가 실측으로
  확인한 제약이다 — EC2 인스턴스 프로파일이 리전과 자격증명을 자동으로 준다. 키를 하드코딩하면
  깃에 새고, 리전을 명시하면 배정 리전 밖이라 `AccessDenied`가 난다.
- **프론트를 별도 서비스(S3/CloudFront)로 안 빼는 이유**: 데모 범위에선 EC2가 정적 파일까지
  같이 서빙하면 프로세스 하나로 끝나고 CORS도 없다. 규모가 커지면 그때 분리한다(§9).

---

## 3. 준비물 체크리스트 (올리기 전에)

- [ ] **EC2 인스턴스** 한 대 (대회 배정). 공인 IP와 접속 키(`.pem`)를 안다.
- [ ] EC2에 붙은 **IAM 역할**에 Bedrock 호출 권한(`bedrock:InvokeModel`)이 있다 —
      `connectionTest/bedrock_simple_test.py`가 EC2에서 성공하면 이미 있는 것이다.
- [ ] **RDS PostgreSQL** 인스턴스 (없으면 §5에서 생성). 엔드포인트·DB명·사용자·비밀번호를 안다.
- [ ] **ElastiCache Redis** (없으면 §5에서 생성). 엔드포인트를 안다.
- [ ] **보안 그룹**: EC2는 8501(웹) + 22(SSH) 열림. RDS·Redis는 EC2에서만 접근 허용.
- [ ] 코드가 조립 완료되어 git에 올라가 있다 (A·B·C + 프론트 빌드 산출물).

---

## 4. 자격증명·환경변수 — 무엇을 어디에 두나

**시크릿은 코드·git에 절대 넣지 않는다.** 세 부류로 나뉜다.

| 값 | 어디서 오나 | 어디에 두나 |
|---|---|---|
| Bedrock 접근 | **EC2 IAM 역할이 자동** | 아무 데도 안 둔다 (코드에 키 없음) |
| `DATABASE_URL` | RDS 엔드포인트 + 계정 | EC2의 `.env` 파일 (git 제외) |
| `REDIS_URL` | ElastiCache 엔드포인트 | EC2의 `.env` 파일 |
| `LLM_MODEL_ID` | 대회 지정 | `.env` 또는 기본값 사용 |

우리 `core/config.py`가 읽는 환경변수 이름은 이렇다 (`.env.example` 참고):

```dotenv
DATABASE_URL=postgresql://<사용자>:<비밀번호>@<RDS엔드포인트>:5432/univoice
REDIS_URL=redis://<ElastiCache엔드포인트>:6379/0
LLM_MODEL_ID=global.anthropic.claude-sonnet-5
PORT=8501
```

> **더 안전하게 가려면**: `.env` 대신 **AWS Secrets Manager**나 **SSM Parameter Store**에
> DB 비밀번호를 넣고 앱이 시작할 때 읽어오는 방법이 있다. 데모 범위에선 EC2 안의 `.env`(권한 600)로
> 충분하지만, 실서비스라면 Secrets Manager를 쓴다. 코드 변경 없이 나중에 붙일 수 있다.

---

## 5. RDS·ElastiCache 만들기 (없다면)

> 이미 대회에서 제공했다면 이 절은 건너뛰고 엔드포인트만 받아 §6으로 간다.

### 5.1 RDS for PostgreSQL
1. AWS 콘솔 → RDS → **Create database** → PostgreSQL.
2. 템플릿은 **Free tier** 또는 최소 사양(`db.t3.micro`) — 데모엔 충분.
3. **DB 이름** `univoice`, 마스터 사용자·비밀번호를 정한다 (이 값이 `DATABASE_URL`에 들어간다).
4. **VPC는 EC2와 같은 VPC**로 둔다 (같은 네트워크 안에 있어야 서로 붙는다).
5. **퍼블릭 액세스는 "아니오"** — 인터넷에 열지 않는다. EC2에서만 접근한다.
6. 보안 그룹: **인바운드 5432를 EC2의 보안 그룹에서만** 허용.
7. 생성되면 **엔드포인트**(예: `univoice.xxxx.rds.amazonaws.com`)를 복사.

### 5.2 ElastiCache for Redis
1. AWS 콘솔 → ElastiCache → **Create** → Redis.
2. 최소 노드(`cache.t3.micro`), 클러스터 모드 비활성으로 충분.
3. **EC2와 같은 VPC/서브넷**.
4. 보안 그룹: **인바운드 6379를 EC2 보안 그룹에서만** 허용.
5. 생성되면 **프라이머리 엔드포인트**를 복사.

> **네트워크가 안 붙을 때 90%는 두 가지**: (1) EC2와 RDS/Redis가 다른 VPC에 있음,
> (2) 보안 그룹이 5432/6379를 EC2에서 허용하지 않음. 이 둘만 맞으면 붙는다.

---

## 6. EC2에 코드 올리고 실행하기 (핵심 절차)

로컬에서 `uvicorn`을 돌리던 것과 똑같은데, 장소가 EC2일 뿐이다.

### 6.1 접속
```bash
ssh -i hackathon-e1-t01-key.pem ec2-user@<EC2_공인_IP>
```

### 6.2 런타임 준비 (최초 1회)
```bash
# Python 3.11+ 확인
python3 --version

# 코드 받기 (git 방식 권장)
git clone <저장소_URL> univoice && cd univoice/src/backend

# 의존성 설치 (가상환경 권장)
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

### 6.3 환경변수 파일 작성
```bash
# src/backend/.env  — RDS·ElastiCache 엔드포인트를 채운다 (git에 올리지 않는다)
cat > .env <<'EOF'
DATABASE_URL=postgresql://univoice_admin:<비밀번호>@<RDS엔드포인트>:5432/univoice
REDIS_URL=redis://<ElastiCache엔드포인트>:6379/0
LLM_MODEL_ID=global.anthropic.claude-sonnet-5
PORT=8501
EOF
chmod 600 .env
```

### 6.4 스키마 생성 + 시드 (B의 산출물 — 최초 1회, 재실행 안전)
```bash
python init_db.py        # 8개 테이블 + 인덱스 생성 (IF NOT EXISTS라 여러 번 돌려도 안전)
python seed_schools.py   # 학교·도메인·관리자 코드 시드 (ON CONFLICT라 중복 안 쌓임)
```

성공하면 `완료: 8개 테이블 + 인덱스가 준비되었습니다.`가 뜬다. RDS에 실제로 붙었다는 증거다.

### 6.5 서버 실행
```bash
# 포그라운드로 한번 확인
uvicorn app.main:app --host 0.0.0.0 --port 8501 --workers 4
```

브라우저에서 `http://<EC2_공인_IP>:8501/health`를 열어 200이 오면 성공.
(워커를 여럿 두는 이유: LLM 호출이 수 초라, 워커 하나면 그동안 다른 요청이 막힌다.)

### 6.6 계속 떠 있게 (백그라운드)
SSH를 끊어도 서버가 살아 있으려면:
```bash
# 간단하게 (데모용)
nohup uvicorn app.main:app --host 0.0.0.0 --port 8501 --workers 4 > server.log 2>&1 &

# 더 견고하게 (재부팅에도 살아남게 — systemd 권장, §7)
```

---

## 7. 재부팅에도 살아남기 — systemd (권장)

`nohup`은 EC2가 재부팅되면 사라진다. 데모 도중 인스턴스가 재시작돼도 자동으로 뜨게 하려면
systemd 서비스로 등록한다.

`/etc/systemd/system/univoice.service`:
```ini
[Unit]
Description=UniVoice FastAPI
After=network.target

[Service]
User=ec2-user
WorkingDirectory=/home/ec2-user/univoice/src/backend
EnvironmentFile=/home/ec2-user/univoice/src/backend/.env
ExecStart=/home/ec2-user/univoice/src/backend/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8501 --workers 4
Restart=always

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now univoice
sudo systemctl status univoice     # 잘 떴는지 확인
journalctl -u univoice -f          # 로그 실시간 보기
```

---

## 8. Docker를 써야 하나? — 안 써도 된다

**결론: AWS 배포에 Docker는 필수가 아니다.** 위(§6·§7)처럼 EC2에서 uvicorn을 직접 돌리는 게
데모엔 가장 빠르고 단순하다.

Docker가 도움이 되는 곳은 따로 있다:

| 상황 | Docker 유용? |
|---|---|
| **로컬에서 A·B·C 조립·통합** | ✅ 매우 유용 — postgres·redis·backend를 `compose up` 한 줄로 (팀 환경 통일) |
| **EC2 단일 인스턴스 데모 배포** | ➖ 선택 — 직접 실행이 더 단순. 이미지 빌드·푸시 단계가 오히려 짐 |
| **여러 대로 확장 / 무중단 배포** | ✅ ECS/Fargate로 갈 때 필요 |

즉 **Docker는 "로컬 통합"에서 쓰고, AWS는 EC2 직접 실행**으로 가는 조합을 권한다.
`docker/` 폴더는 이미 그 용도(로컬 개발)로 잡혀 있다.

> 앱을 굳이 컨테이너로 배포하고 싶다면: `backend.Dockerfile`로 이미지를 만들어 **ECR**(AWS의
> 이미지 저장소)에 올리고, EC2에서 `docker run` 하거나 **ECS/Fargate**로 돌린다. DB·Redis는
> 여전히 RDS·ElastiCache다. 데모 마감이 급하면 이 경로는 나중으로 미룬다.

---

## 9. 배포 순서 요약 (체크리스트)

```
1. RDS(PostgreSQL) 생성 → 엔드포인트 확보           (§5.1)
2. ElastiCache(Redis) 생성 → 엔드포인트 확보         (§5.2)
3. 보안 그룹 정리: EC2 8501/22 열기, RDS·Redis는 EC2만  (§3)
4. EC2 IAM 역할에 Bedrock 권한 확인 (bedrock_simple_test.py 성공) (§4)
5. EC2 접속 → 코드 clone → pip install               (§6.2)
6. .env 작성 (RDS·Redis 엔드포인트)                   (§6.3)
7. python init_db.py && python seed_schools.py       (§6.4)
8. systemd로 uvicorn 등록 → 실행                      (§7)
9. http://<IP>:8501/health 로 확인                    (§6.5)
```

---

## 10. 나중에 다듬을 것 (데모 이후)

- **HTTPS**: 지금은 EC2 IP로 http 접속이라 쿠키에 `Secure`를 못 단다(`SameSite=Lax`로 감수).
  도메인 + ACM 인증서 + ALB(로드밸런서)를 붙이면 https가 된다. 붙이면 쿠키를 `Secure`로 올린다.
- **비밀번호 관리**: `.env` → AWS Secrets Manager / SSM Parameter Store.
- **정적 프론트 분리**: 트래픽이 커지면 프론트를 S3 + CloudFront로 빼고 EC2는 API만.
- **로그·모니터링**: CloudWatch Logs로 uvicorn 로그 수집 (Bedrock 호출 로그는 이미 `bedrock_logs`
  테이블에 있으니 심사용은 그걸로 충분).
- **백업**: RDS 자동 백업 보존 기간 설정 (데모엔 기본값으로 충분).

---

## 11. 자주 막히는 곳

| 증상 | 원인 / 해결 |
|---|---|
| `init_db.py`가 멈춰 있다 (타임아웃) | EC2↔RDS 네트워크. 같은 VPC인지, 보안 그룹이 5432를 EC2에서 허용하는지 |
| Redis 연결 거부 | 보안 그룹이 6379를 EC2에서 허용하는지, 엔드포인트 오타 |
| Bedrock `AccessDenied` | 리전을 코드에 명시했거나 IAM 역할에 권한 없음. 리전 명시 제거(§4) |
| Bedrock `on-demand throughput isn't supported` | raw 모델 id를 씀. `global.` 프로필 id를 써야 함 |
| 8501이 브라우저에서 안 열림 | 보안 그룹 인바운드에 8501(0.0.0.0/0 또는 심사 IP) 없음 |
| 재부팅하니 서버가 사라짐 | `nohup`이라 그렇다. systemd로 등록(§7) |
