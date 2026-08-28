"""학교 시드 무결성 + 도메인 정규화 검증.

서비스할 5개 학교(조선대·순천대·군산대·전남대·전북대)가 시드에 정확히 들어 있고,
도메인 형식·중복·코드 무결성이 지켜지는지 못박는다. 실 DB 없이 순수 데이터로 검증.
"""
import pytest

import seed_schools
from app.repo.school_repo import normalize_domain


EXPECTED = {
    "조선대학교": "chosun.ac.kr",
    "국립순천대학교": "sunchon.ac.kr",
    "국립군산대학교": "kunsan.ac.kr",
    "전남대학교": "jnu.ac.kr",
    "전북대학교": "jbnu.ac.kr",
}


def test_seed_has_exactly_the_five_service_schools():
    got = {name: domain for name, domain, _, _ in seed_schools.SCHOOLS}
    assert got == EXPECTED


def test_seed_data_passes_integrity_validation():
    # 정상 시드는 예외 없이 통과해야 한다.
    seed_schools.validate_seed()


def test_every_school_has_admin_codes_and_aliases():
    for name, domain, aliases, codes in seed_schools.SCHOOLS:
        assert aliases, f"{name}: 별칭 없음"
        assert codes, f"{name}: 관리자 코드 없음"


def test_validate_rejects_bad_domain():
    bad = [("X대", "not_a_domain", ["x"], ["C1"])]
    with pytest.raises(ValueError):
        seed_schools.validate_seed(bad)


def test_validate_rejects_uppercase_domain():
    bad = [("X대", "Chosun.ac.kr", ["x"], ["C1"])]
    with pytest.raises(ValueError):
        seed_schools.validate_seed(bad)


def test_validate_rejects_duplicate_domain():
    dup = [
        ("A대", "same.ac.kr", ["a"], ["A1"]),
        ("B대", "same.ac.kr", ["b"], ["B1"]),
    ]
    with pytest.raises(ValueError):
        seed_schools.validate_seed(dup)


def test_validate_rejects_shared_admin_code():
    shared = [
        ("A대", "a.ac.kr", ["a"], ["SHARED"]),
        ("B대", "b.ac.kr", ["b"], ["SHARED"]),
    ]
    with pytest.raises(ValueError):
        seed_schools.validate_seed(shared)


def test_validate_rejects_empty_code():
    bad = [("A대", "a.ac.kr", ["a"], [])]
    with pytest.raises(ValueError):
        seed_schools.validate_seed(bad)


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("  Student1@Chosun.AC.KR ", "chosun.ac.kr"),
        ("JBNU.ac.kr", "jbnu.ac.kr"),
        ("a@b@jnu.ac.kr", "jnu.ac.kr"),   # 마지막 @ 뒤만
        ("SUNCHON.AC.KR", "sunchon.ac.kr"),
        ("", ""),
    ],
)
def test_normalize_domain(raw, expected):
    assert normalize_domain(raw) == expected
