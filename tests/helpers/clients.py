import logging
import unittest
from typing import List, Union

import dateutil.parser as dp
import psycopg
from gql import Client
from gql.transport.aiohttp import AIOHTTPTransport
from gql.transport.aiohttp import log as aiohttp_logger
from psycopg import Connection, Cursor

from src.genesis.db.table_manager import TableManager

from .gql_queries import latest_block_timestamp

aiohttp_logger.setLevel(logging.WARNING)

CASCADE_TRUNCATE_TABLES = frozenset({"blocks", "transactions", "messages", "events"})

# TODO: support overriding somehow (e.g. CLI args)
DB_HOST = "localhost"
DB_PORT = "5432"
DB_NAME = "subquery"
DB_USER = "subquery"
DB_PASS = "subquery"
DB_SCHEMA = "app"
FETCHD_HOST = "localhost"
FETCHD_GRPC_PORT = "9090"
WASMD_HOST = "localhost"
WASMD_GRPC_PORT = "19090"
GRAPHQL_API_URL = "http://localhost:3000"


class TruncationException(Exception):
    def __init__(self, table, count):
        super().__init__(
            f'truncation of table "{table}" failed, {count} records remain'
        )


class TestWithDBConn(unittest.TestCase):
    db_conn: Connection
    db_cursor: Cursor

    @classmethod
    def setUpClass(cls) -> None:
        cls.db_conn = psycopg.connect(
            host=DB_HOST,
            port=DB_PORT,
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASS,
            options="-c search_path=app",
        )

        cls.db_cursor = cls.db_conn.cursor()
        cls.db_cursor.execute(f"SET SCHEMA '{DB_SCHEMA}'")
        cls.db_conn.commit()

    @classmethod
    def tearDownClass(cls) -> None:
        if cls.db_cursor is not None:
            cls.db_cursor.close()

        if cls.db_conn is not None:
            cls.db_conn.close()

    @classmethod
    def clean_db(cls, ensure_empty_tables=frozenset()):
        table_names = list(CASCADE_TRUNCATE_TABLES.union(ensure_empty_tables))
        cls.truncate_tables(table_names, cascade=True)

    @classmethod
    def truncate_tables(cls, tables: Union[str, List[str]], cascade=False):
        table_manager = TableManager(cls.db_conn)

        cascade_str = ""
        if cascade:
            cascade_str = "CASCADE"

        if isinstance(tables, List):
            tables_str = ", ".join([t for t in tables if table_manager.table_exists(t)])
        else:
            if not table_manager.table_exists(tables):
                return
            tables_str = tables

        cls.db_cursor.execute(f"TRUNCATE table {tables_str} {cascade_str}")
        cls.db_conn.commit()


class TestWithGQLClient(unittest.TestCase):
    gql_client: Client

    @classmethod
    def setUpClass(cls) -> None:
        transport = AIOHTTPTransport(url=GRAPHQL_API_URL)
        cls.gql_client = Client(transport=transport, fetch_schema_from_transport=True)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.gql_client.close_async()

    @classmethod
    def get_latest_block_timestamp(cls):
        result = cls.gql_client.execute(latest_block_timestamp)
        return dp.parse(result["blocks"]["nodes"][0]["timestamp"])
