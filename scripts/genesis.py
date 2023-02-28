#!/usr/bin/env python

import argparse

from os import environ

import psycopg

from src.genesis.cli.args import add_arguments
from src.genesis.genesis import GenesisSingleton
from src.genesis.observers import process_genesis


def main():
    parser = argparse.ArgumentParser(description="""
        Process genesis from JSON_URL into DB records.
        Environment variables DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_SCHEMA, and DB_NAME will override flags.
    """)

    env_db_host = environ.get("DB_HOST")
    env_db_port = environ.get("DB_PORT")
    env_db_user = environ.get("DB_USER")
    env_db_pass = environ.get("DB_PASS")
    env_db_schema = environ.get("DB_SCHEMA")
    env_db_name = environ.get("DB_NAME")

    add_arguments(parser)
    args = parser.parse_args()

    db_host = env_db_host or args.db_host
    if db_host is None:
        raise Exception("either --db-host flag OR DB_HOST env var must be set")

    db_port = env_db_port or args.db_port
    db_user = env_db_user or args.db_user
    db_pass = env_db_pass or args.db_pass
    db_schema = env_db_schema or args.db_schema or "app"
    db_name = env_db_name or args.db_name

    # TODO: progress indicators (?)

    print("Downloading..")
    GenesisSingleton(args.json_url)
    print("done!")

    connection_args = {
        "host": db_host,
        "port": db_port,
        "dbname": db_name,
        "user": db_user,
        "password": db_pass,
        "options": f"-c search_path={db_schema}"
    }

    db_conn = psycopg.connect(**connection_args)

    print("Processing..")
    process_genesis(db_conn)
    print("done!")


if __name__ == '__main__':
    main()
