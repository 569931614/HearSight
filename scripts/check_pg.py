import psycopg2

host='103.117.136.93'
port=5432
user='postgres'
password='zT84AEZZz2ZjCRjC'
dbname='hearsight'

def try_conn(label, dsn):
    print(f'--- {label} ---')
    try:
        conn = psycopg2.connect(dsn, connect_timeout=8)
        cur = conn.cursor()
        cur.execute('SELECT version()')
        print('OK', cur.fetchone()[0])
        conn.close()
    except Exception as e:
        print('ERR', repr(e))

try_conn('kwargs', f'host={host} port={port} user={user} password={password} dbname={dbname}')
try_conn('url', f'postgresql://{user}:{password}@{host}:{port}/{dbname}')
try_conn('url+ssl', f'postgresql://{user}:{password}@{host}:{port}/{dbname}?sslmode=require')
