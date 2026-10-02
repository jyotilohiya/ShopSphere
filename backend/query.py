import sqlite3
import json

db_path = r'c:\Users\Jyoti\OneDrive\Desktop\Multi-Vendor E-Commerce\backend\data\shopsphere.db'
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

def q(sql):
    try:
        return [dict(r) for r in cur.execute(sql).fetchall()]
    except Exception as e:
        return str(e)

print('--- TABLES ---')
print([r['name'] for r in q("SELECT name FROM sqlite_master WHERE type='table';")])

print('\n--- SCHEMA ---')
for t in ['orders', 'order_items', 'products', 'vendors']:
    print(f'Table: {t}')
    print(q(f"PRAGMA table_info({t})"))

print('\n--- RAW DATA COUNTS ---')
print('Orders:', q("SELECT COUNT(*) as c FROM orders"))
print('Products:', q("SELECT COUNT(*) as c FROM products"))
print('Vendors:', q("SELECT COUNT(*) as c FROM vendors"))
print('Order Items:', q("SELECT COUNT(*) as c FROM order_items"))

print('\n--- ORDERS SNAPSHOT ---')
for r in q("SELECT * FROM orders"):
    print(r)

print('\n--- ORDER ITEMS SNAPSHOT ---')
for r in q("SELECT * FROM order_items"):
    print(r)

print('\n--- PRODUCT LIST ---')
for r in q("SELECT id, name, vendor_id, price, stock FROM products"):
    print(r)
