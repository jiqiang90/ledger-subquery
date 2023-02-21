from typing import List, Optional, Tuple

from psycopg import Connection
from psycopg.errors import UniqueViolation
from reactivex import Observable, Observer
from reactivex.abc import DisposableBase
from reactivex.operators import buffer_with_count
from reactivex.operators import filter as filter_
from reactivex.operators import map as map_
from reactivex.operators import observe_on
from reactivex.scheduler.scheduler import Scheduler

from src.genesis.db import DBTypes, TableManager
from src.genesis.helpers.field_enums import Contracts
from src.genesis.state import Contract
from src.utils.loggers import get_logger

contracts_keys_path = ".app_state.wasm.contracts"

_logger = get_logger(__name__)


class GenesisContractsObserver(Observer):
    @staticmethod
    def filter_contracts(next_: Tuple[str, dict, list]) -> bool:
        return next_[0].startswith(contracts_keys_path)

    def __init__(self, on_next=None, on_completed=None, on_error=None) -> None:
        super().__init__(on_next=on_next, on_completed=on_completed, on_error=on_error)

    def subscribe_to(
            self, observable: Observable, pre_operators=None, post_operators=None
    ) -> DisposableBase:
        _operators = [
            filter_(self.filter_contracts),
        ]
        if post_operators is not None:
            _operators += post_operators
        if pre_operators is not None:
            _operators = pre_operators + _operators

        return observable.pipe(*_operators).subscribe(
            on_next=self.on_next, on_completed=self.on_completed, on_error=self.on_error
        )

    @staticmethod
    def map_contracts(next_: Contract):
        return next_


class GenesisContractsManager(TableManager):
    _observer: GenesisContractsObserver
    _subscription: DisposableBase
    _db_conn: Connection
    _table = Contracts.get_table()
    _columns = (
        ("id", DBTypes.text),
        ("interface", DBTypes.interface),
        ("store_message_id", DBTypes.text),
        ("instantiate_message_id", DBTypes.text),
    )
    _indexes = (
    )

    def __init__(self, db_conn: Connection, on_completed=None, on_error=None) -> None:
        super().__init__(db_conn)
        self._ensure_table()
        self._observer = GenesisContractsObserver(
            on_next=self.copy_contracts, on_completed=on_completed, on_error=on_error
        )

    @classmethod
    def _get_name_and_index(
            cls, e: UniqueViolation, contracts: List[Contract]
    ) -> Tuple[str, Optional[int]]:
        # Extract contract address from error string
        duplicate_contract_id = cls._extract_id_from_unique_violation_exception(e)

        # Find duplicate contract index
        duplicate_contract_index: Optional[int] = None

        for i in range(len(contracts)):
            if contracts[i].contract_address == duplicate_contract_id:
                duplicate_contract_index = i

        return duplicate_contract_id, duplicate_contract_index

    def copy_contracts(self, contracts: List[Contract]) -> None:
        with self._db_conn.cursor() as db:
            duplicate_occured = True

            while duplicate_occured:
                try:
                    duplicate_occured = False
                    with db.copy(
                            f'COPY {self._table} ({",".join(self.get_column_names())}) FROM STDIN'
                    ) as copy:
                        for contract in contracts:
                            values = [
                                f"{getattr(contract, c)}"
                                for c in self.get_column_names()
                            ]
                            copy.write_row(values)

                except UniqueViolation as e:
                    duplicate_occured = True
                    self._db_conn.commit()

                    (
                        duplicate_contract_id,
                        duplicate_contract_index,
                    ) = self._get_name_and_index(e, contracts)

                    if duplicate_contract_index is None:
                        raise RuntimeError(
                            f"Error during duplicate balance handling, account {duplicate_contract_id} not found"
                        )

                    # Compare contract in genesis with contract in db
                    address_on_list: str = (
                        contracts[duplicate_contract_index]
                        .contract_address
                    )
                    res_db_select = db.execute(
                        Contracts.select_where(f"id = '{duplicate_contract_id}'")
                    ).fetchone()

                    assert res_db_select is not None

                    address_in_db: str = res_db_select[2]

                    if address_on_list != address_in_db:
                        raise RuntimeError(
                            f"Contract for {duplicate_contract_id} in DB ({address_in_db}) is different from genesis ({address_on_list})"
                        )

                    # Remove duplicate contract from queue
                    contracts.pop(duplicate_contract_index)

                    _logger.warning(
                        f"Duplicate contract occurred during COPY: {duplicate_contract_id}"
                    )

        self._db_conn.commit()

    def observe(
            self,
            observable: Observable,
            scheduler: Optional[Scheduler] = None,
            buffer_size: int = 500,
    ) -> None:
        pre_operators = []
        post_operators = [
            map_(self._observer.map_contracts),
            buffer_with_count(buffer_size),
        ]
        if scheduler is not None:
            pre_operators.append(observe_on(scheduler=scheduler))

        self._subscription = self._observer.subscribe_to(
            observable, pre_operators=pre_operators, post_operators=post_operators
        )
