"""One-off helper to set up a dedicated schema and search_path for HearSight.

Usage examples (PowerShell):

1) Using DSN / URL directly:
  python -m backend.db.setup_schema --dsn "postgresql://user:pass@127.0.0.1:5432/dbname" --business-user hearsight --schema hearsight

2) Using discrete parameters:
  python -m backend.db.setup_schema --host 127.0.0.1 --port 5432 --user postgres --password secret --dbname hearsight --business-user hearsight --schema hearsight

Notes:
- "business-user" is the role that your app uses to connect (e.g., hearsight)
- The connecting user must have enough privileges to CREATE SCHEMA and ALTER ROLE
"""

from __future__ import annotations

import argparse
import os
import sys
from typing import Any, Dict, Optional

import psycopg2
from psycopg2 import sql


def _build_conn_params_or_dsn(
    dsn: Optional[str],
    host: Optional[str],
    port: Optional[int],
    user: Optional[str],
    password: Optional[str],
    dbname: Optional[str],
) -> Dict[str, Any] | str:
    """Return either a DSN string or a kwargs dict for psycopg2.connect.

    Priority:
    - If dsn is provided, return it as a string
    - Else build kwargs from provided fields or environment variables
    """
    if dsn:
        return dsn

    # Fallback to env vars if fields not provided
    host = host or os.environ.get("POSTGRES_HOST") or "127.0.0.1"
    port = port or int(os.environ.get("POSTGRES_PORT") or 5432)
    user = user or os.environ.get("POSTGRES_USER") or "postgres"
    password = password or os.environ.get("POSTGRES_PASSWORD")
    dbname = dbname or os.environ.get("POSTGRES_DB") or "postgres"

    params: Dict[str, Any] = {"host": host, "port": port, "user": user, "dbname": dbname}
    if password:
        params["password"] = password
    return params


def _run_setup(
    conn_handle: Dict[str, Any] | str,
    business_user: str,
    schema_name: str,
) -> None:
    # Connect
    conn = psycopg2.connect(conn_handle) if isinstance(conn_handle, str) else psycopg2.connect(**conn_handle)
    try:
        with conn:
            with conn.cursor() as cur:
                # CREATE SCHEMA IF NOT EXISTS <schema> AUTHORIZATION <business_user>
                cur.execute(
                    sql.SQL("CREATE SCHEMA IF NOT EXISTS {} AUTHORIZATION {};").format(
                        sql.Identifier(schema_name), sql.Identifier(business_user)
                    )
                )

                # ALTER ROLE <business_user> SET search_path = <schema>, public
                cur.execute(
                    sql.SQL("ALTER ROLE {} SET search_path = {}, public;").format(
                        sql.Identifier(business_user), sql.Identifier(schema_name)
                    )
                )

                # Show confirmations
                cur.execute("SHOW search_path;")
                sp = cur.fetchone()[0]
                cur.execute("SELECT current_user, current_database();")
                who = cur.fetchone()

        print("Setup completed.")
        print(f"- Applied for business user: {business_user}")
        print(f"- Dedicated schema: {schema_name}")
        print(f"- search_path now: {sp}")
        print(f"- Connected as: user={who[0]} database={who[1]}")
    finally:
        conn.close()


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Setup dedicated schema and search_path for HearSight")
    parser.add_argument("--dsn", type=str, default=os.environ.get("POSTGRES_DSN") or os.environ.get("DATABASE_URL"), help="Postgres connection DSN/URL")
    parser.add_argument("--host", type=str, default=None)
    parser.add_argument("--port", type=int, default=None)
    parser.add_argument("--user", type=str, default=None, help="Admin user (or any user with enough privileges)")
    parser.add_argument("--password", type=str, default=None)
    parser.add_argument("--dbname", type=str, default=None)

    parser.add_argument("--business-user", type=str, default=os.environ.get("POSTGRES_USER") or "hearsight", help="App role to own schema and be assigned search_path")
    parser.add_argument("--schema", type=str, default="hearsight", help="Dedicated schema name to create/use")

    args = parser.parse_args(argv)

    try:
        conn_handle = _build_conn_params_or_dsn(
            dsn=args.dsn,
            host=args.host,
            port=args.port,
            user=args.user,
            password=args.password,
            dbname=args.dbname,
        )
        _run_setup(conn_handle, business_user=args.business_user, schema_name=args.schema)
        return 0
    except Exception as e:
        print(f"[ERROR] {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())



