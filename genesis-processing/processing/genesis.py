from psycopg import Connection
from .accounts import AccountsManager


def get_chain_id(genesis_data: dict):
    return genesis_data["chain_id"]


def process_genesis(db_conn: Connection, genesis_data: dict):
    chain_id = get_chain_id(genesis_data)
    accounts_manager = AccountsManager(db_conn)

    accounts_manager.process_genesis(genesis_data["app_state"]["bank"]["balances"], chain_id)
