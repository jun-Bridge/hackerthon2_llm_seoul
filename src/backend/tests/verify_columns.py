"""쿼리가 참조하는 컬럼·테이블이 실제 스키마(init_db.DDL)에 존재하는지 검증.

오타난 컬럼명(예: refined_titel)은 문법 검사·바인딩 검사로는 안 잡히고 런타임에
'column ... does not exist'로 터진다. DDL을 파싱해 테이블→컬럼 집합을 만들고,
각 SQL이 참조하는 (테이블.컬럼)이 그 안에 있는지 대조한다.

pglast의 파스 트리를 순회해 ColumnRef/RangeVar를 뽑는다.
실행: python tests/verify_columns.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pglast
from pglast import ast

import init_db
from tests.verify_params import CheckConn, exercise  # SQL 수집 재사용


def build_schema(ddl: str) -> dict[str, set[str]]:
    """DDL에서 {테이블명: {컬럼명...}} 를 뽑는다."""
    schema: dict[str, set[str]] = {}
    for stmt in pglast.parse_sql(ddl):
        node = stmt.stmt
        if isinstance(node, ast.CreateStmt):
            table = node.relation.relname
            cols = set()
            for elt in node.tableElts or []:
                if isinstance(elt, ast.ColumnDef):
                    cols.add(elt.colname)
            schema[table] = cols
    return schema


def collect_sqls() -> list[str]:
    conn = CheckConn()
    exercise(conn)
    # CheckConn.calls: (label, ...) — 원문 SQL을 따로 모으기 위해 execute를 다시 감싼다.
    sqls = []

    class Grab:
        def execute(self, sql, params=None):
            sqls.append(sql)
            return self
        def fetchone(self): return {"id": 1, "refined_json": {}, "password_hash": "x",
                                    "user_id": 1, "school_id": 1, "status": "미확인",
                                    "aliases": None, "n": 0}
        def fetchall(self): return []
        @property
        def rowcount(self): return 1

    exercise(Grab())
    return sqls


def columns_in(sql: str) -> set[str]:
    """SQL에서 참조하는 컬럼 이름(단순 이름)을 모은다. 별칭 접두어는 무시하고 필드명만."""
    names = set()
    probe = sql.replace("%s", "NULL")
    for stmt in pglast.parse_sql(probe):
        for node in _walk(stmt):
            if isinstance(node, ast.ColumnRef):
                parts = [f.sval for f in node.fields if isinstance(f, ast.String)]
                if parts:
                    names.add(parts[-1])  # 마지막이 컬럼명 (앞은 테이블 별칭)
            elif isinstance(node, ast.ResTarget) and node.name:
                names.add(node.name)  # INSERT 대상 컬럼
    return names


def tables_in(sql: str) -> set[str]:
    names = set()
    probe = sql.replace("%s", "NULL")
    for stmt in pglast.parse_sql(probe):
        for node in _walk(stmt):
            if isinstance(node, ast.RangeVar):
                names.add(node.relname)
    return names


def _walk(node):
    """pglast AST를 재귀 순회."""
    yield node
    for child in _children(node):
        yield from _walk(child)


def _children(node):
    out = []
    if isinstance(node, (list, tuple)):
        for x in node:
            if x is not None:
                out.append(x)
        return out
    attrs = getattr(node, "__slots__", None) or getattr(node, "attribute_names", ())
    for name in attrs:
        try:
            val = getattr(node, name)
        except AttributeError:
            continue
        if isinstance(val, (ast.Node,)):
            out.append(val)
        elif isinstance(val, (list, tuple)):
            for x in val:
                if isinstance(x, ast.Node):
                    out.append(x)
    return out


# COUNT(*) 같은 함수·별칭은 컬럼이 아니므로 무시 목록에 둔다.
# school_name: user_repo.find_me 의 `s.name AS school_name` 응답용 별칭 (실 컬럼 아님).
IGNORE = {"n", "withdrawn", "school_name"}  # SELECT ... AS <별칭>


def main():
    schema = build_schema(init_db.DDL)
    all_cols = set()
    for cols in schema.values():
        all_cols |= cols
    print(f"[..] 스키마 테이블 {len(schema)}개, 컬럼 {len(all_cols)}개")

    known_tables = set(schema)
    sqls = collect_sqls()
    failures = []
    for sql in sqls:
        label = " ".join(sql.split())[:55]
        for t in tables_in(sql):
            if t not in known_tables:
                failures.append((label, f"미지의 테이블 {t!r}"))
        for c in columns_in(sql):
            if c in IGNORE:
                continue
            if c not in all_cols:
                failures.append((label, f"미지의 컬럼 {c!r}"))

    if failures:
        print(f"[FAIL] {len(failures)}건:")
        for label, msg in failures:
            print(f"  - {msg}  ({label})")
        sys.exit(1)
    print(f"[OK] SQL {len(sqls)}개가 참조하는 모든 테이블·컬럼이 스키마에 존재한다")


if __name__ == "__main__":
    main()
