from psycopg import Connection
from db.table_manager import TableManager, DBTypes
from db.field_enums import Accounts
from typing import List, Optional, Tuple
from psycopg.errors import UniqueViolation

from utils.loggers import get_logger
from copy import deepcopy

_logger = get_logger(__name__)


class AccountsManager():
    def __init__(self, db_conn: Connection):
        table = Accounts.get_table()
        columns = (
            ("id", DBTypes.text),
            ("chain_id", DBTypes.text),
        )
        indexes = (
            "id",
            "chain_id",
        )

        self.db_conn = db_conn
        self.table_manager = TableManager(db_conn, table, columns, indexes)

        self.table_manager.ensure_table()

    def _get_name_and_index(
            self, e: UniqueViolation, accounts_data: List[dict]
    ) -> Tuple[str, Optional[int]]:
        # Extract account name from error string
        duplicate_account_id = self.table_manager.extract_id_from_unique_violation_exception(e)

        # Find duplicate account index
        duplicate_account_index = None
        for i in range(len(accounts_data)):
            if accounts_data[i]["address"] == duplicate_account_id:
                duplicate_account_index = i

        return duplicate_account_id, duplicate_account_index

    def process_genesis(self, accounts_data: List[dict], chain_id: str):
        # Prevent data from being modified
        accounts_data = deepcopy(accounts_data)

        with self.db_conn.cursor() as db:
            duplicate_occured = True

            while duplicate_occured:
                try:
                    duplicate_occured = False
                    with db.copy(
                            f'COPY {self.table_manager.table} ({",".join(self.table_manager.get_column_names())}) FROM STDIN'
                    ) as copy:
                        for account in accounts_data:
                            values = [str(account["address"]), chain_id]
                            copy.write_row(values)
                except UniqueViolation as e:
                    duplicate_occured = True

                    (
                        duplicate_account_id,
                        duplicate_account_index,
                    ) = self._get_name_and_index(e, accounts_data)

                    if duplicate_account_index is None:
                        raise RuntimeError(
                            f"Error during duplicate handling, account id {duplicate_account_id} not found"
                        )

                    # Remove duplicate account from queue
                    accounts_data.pop(duplicate_account_index)

                    _logger.warning(
                        f"Duplicate account occurred during COPY: {duplicate_account_id}"
                    )
                    self.db_conn.commit()

        self.db_conn.commit()
