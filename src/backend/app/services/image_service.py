"""첨부 이미지 전처리 — 프론트가 보낸 원본을 Bedrock이 받을 수 있게 서버가 다듬는다.

설계 원칙: **복잡한 것은 전부 백엔드가 한다.** 프론트는 파일을 base64(또는 data URL)로
그대로 실어 보내기만 하고, 리사이즈·형식 변환·용량 축소는 여기서 처리한다.

호출하는 쪽: app/services/session_service.py (send_message)
동작:
  1) validate_image_attachment로 형식/최대 원본 크기만 1차 확인 (llm.validation 재사용)
  2) base64 디코딩 → Pillow로 열기
  3) EXIF 회전 보정 후 긴 변을 _MAX_EDGE 이하로 축소
  4) JPEG(품질 85)로 재인코딩 → base64
  결과는 항상 image/jpeg. Bedrock 요청 한도 안으로 들어온다.

Pillow가 없거나 디코딩 실패 시 DomainError(400)로 올린다 — 서버가 못 다루는 이미지는 거절.
"""
import base64
import io

from app.core.errors import DomainError
from app.llm.validation import ContractViolation, validate_image_attachment

# Bedrock/Claude vision에 보낼 최종 긴 변 상한(px)과 JPEG 품질.
_MAX_EDGE = 1024
_JPEG_QUALITY = 85


def prepare_for_bedrock(media_type, data) -> dict[str, str]:
    """프론트 원본 이미지를 검증·축소·재인코딩해 {media_type, data(base64)} 로 돌려준다.

    Args:
        media_type: 'image/jpeg' 등 또는 None(data가 data URL이면 거기서 추출).
        data: base64 문자열 또는 'data:image/...;base64,...' data URL.

    Returns:
        {"media_type": "image/jpeg", "data": <리사이즈된 base64>}

    Raises:
        DomainError: 형식/크기 위반, 디코딩 실패, Pillow 미설치 등 서버가 처리 못 하는 경우.
    """
    # 1) 형식·최대 원본 크기 1차 검증 (순수 base64로 정규화됨)
    try:
        normalized = validate_image_attachment(media_type, data)
    except ContractViolation as exc:
        raise DomainError("첨부한 이미지를 처리할 수 없습니다. (형식·크기 확인)") from exc

    # 2) base64 디코딩
    try:
        raw = base64.b64decode(normalized["data"], validate=True)
    except Exception as exc:
        raise DomainError("이미지 데이터를 해석할 수 없습니다.") from exc

    # 3) Pillow로 열고 리사이즈 + JPEG 재인코딩
    try:
        from PIL import Image, ImageOps
    except Exception as exc:  # pragma: no cover - 환경 의존
        raise DomainError("서버가 이미지를 처리할 수 없습니다. (이미지 라이브러리 없음)") from exc

    try:
        with Image.open(io.BytesIO(raw)) as im:
            im = ImageOps.exif_transpose(im)  # 회전 메타 반영
            im = im.convert("RGB")             # 알파/팔레트 제거 (JPEG 저장 위해)
            im.thumbnail((_MAX_EDGE, _MAX_EDGE))  # 비율 유지 축소 (원본이 작으면 그대로)
            buf = io.BytesIO()
            im.save(buf, format="JPEG", quality=_JPEG_QUALITY, optimize=True)
    except DomainError:
        raise
    except Exception as exc:
        raise DomainError("이미지를 열 수 없습니다. 지원되는 사진 파일인지 확인해 주세요.") from exc

    encoded = base64.b64encode(buf.getvalue()).decode("ascii")
    return {"media_type": "image/jpeg", "data": encoded}
