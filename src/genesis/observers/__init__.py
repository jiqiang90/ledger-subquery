import multiprocessing
import sys
import threading

from reactivex.scheduler import ThreadPoolScheduler

from src.genesis.genesis import GenesisSingleton

from .accounts import *  # noqa: F401
from .balances import *  # noqa: F401
from .chain_id import *  # noqa: F401
from .contracts import GenesisContractsManager


def process_genesis(db_conn_factory):
    genesis = GenesisSingleton()

    accounts_done = threading.Lock()
    accounts_done.acquire()
    balances_done = threading.Lock()
    balances_done.acquire()
    contracts_done = threading.Lock()
    contracts_done.acquire()

    cpu_count = multiprocessing.cpu_count()
    scheduler = ThreadPoolScheduler(max_workers=cpu_count)

    def on_error(error):
        sys.exit(error)

    def on_accounts_completed():
        accounts_done.release()

    def on_contracts_completed():
        contracts_done.release()

    # TODO: unworkaround a DB connection per concurrent "table manager"
    accounts_db_conn = db_conn_factory()
    AccountsManager(  # noqa: F405
        accounts_db_conn, on_error=on_error, on_completed=on_accounts_completed
    ).observe(genesis.source, scheduler=scheduler)

    balances_db_conn = db_conn_factory()
    GenesisBalancesManager(  # noqa: F405
        balances_db_conn,
        on_error=on_error,
        on_completed=lambda: balances_done.release(),
    ).observe(genesis.source, scheduler=scheduler, delay=3)

    contracts_db_conn = db_conn_factory()
    GenesisContractsManager(
        contracts_db_conn,
        on_error=on_error,
        on_completed=lambda: contracts_done.release(),
    ).observe(genesis.source, scheduler=scheduler)

    accounts_done.acquire()
    balances_done.acquire()
    contracts_done.acquire()
