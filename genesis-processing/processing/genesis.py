from psycopg import Connection

from .accounts import AccountsManager
from .balances import BalanceManager


def get_chain_id(genesis_data: dict):
    return genesis_data["chain_id"]


def process_genesis(db_conn: Connection, genesis_data: dict):
    chain_id = get_chain_id(genesis_data)
    accounts_manager = AccountsManager(db_conn)
    balances_manager = BalanceManager(db_conn)

    accounts_manager.process_genesis(genesis_data, chain_id)
    balances_manager.process_genesis(genesis_data)
