from typing import Any, Generator, Tuple

from psycopg import Connection
from psycopg.errors import UniqueViolation
from enum import Enum


class DBTypes(Enum):
    text = "text"
    numeric = "numeric"
    interface = "public.app_enum_0f6c2478ba"



class TableManager:

    def __init__(self, db_conn: Connection,
                 table: str,
                 columns: Tuple[Tuple[str, DBTypes], ...],
                 indexes: Tuple[str, ...],
                 schema: str = "app"):
        self.db_conn = db_conn
        self.table = table
        self.columns= columns
        self.indexes= indexes
        self.schema = schema

    def get_column_names(self) -> Generator[str, Any, None]:
        return (name for name, _ in self.columns)

    def select_query(self) -> str:
        return f"""
            SELECT {",".join(self.get_column_names())} FROM {self.table}
        """

    def ensure_table(self):
        with self.db_conn.cursor() as db:
            db.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {self.schema}.{self.table} (
                    {", ".join([f"{name} {type_.value}" for name, type_ in self.columns])}
                );
                -- TODO: psycopg break out of transaction
                -- CREATE INDEX CONCURRENTLY ON {self.schema}.{self.table} ({",".join(self.indexes)})
            """
            )
            self.db_conn.commit()
            # TODO error checking / handling (?)

    def drop_table(self, cascade: bool = False):
        cascade_clause = ""
        if cascade:
            cascade_clause = "CASCADE"

        with self.db_conn.cursor() as db:
            db.execute(
                f"""
                DROP TABLE IF EXISTS {self.schema}.{self.table} {cascade_clause};
            """
            )
            self.db_conn.commit()
            # TODO error checking / handling (?)

    @classmethod
    def extract_id_from_unique_violation_exception(cls, e: UniqueViolation) -> str:
        # Extract which ID was violated from UniqueViolation exception
        return str(e).split("(")[2].split(")")[0]


    def table_exists(self, table: str) -> bool:
        with self.db_conn.cursor() as db:
            res_db_execute = db.execute(
                f"""
                    SELECT EXISTS (
                        SELECT FROM pg_tables WHERE
                            schemaname = 'app' AND
                            tablename  = '{table}'
                    )
                """
            ).fetchone()

            assert res_db_execute is not None

            return res_db_execute[0]
