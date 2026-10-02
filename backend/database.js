const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'shopsphere.db');
const db = new Database(dbPath);

// Enable foreign keys and WAL mode for better performance
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// =====================================================
// BASE TABLES (IF NOT EXISTS — safe for existing DBs)
// =====================================================
db.exec(`
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        category TEXT NOT NULL,
        vendor TEXT NOT NULL,
        icon TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS vendors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        business TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        phone TEXT NOT NULL,
        category TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        status TEXT DEFAULT 'Active',
        registered_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_name TEXT NOT NULL,
        customer_email TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        customer_address TEXT NOT NULL,
        total REAL NOT NULL,
        status TEXT DEFAULT 'Placed',
        order_date DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        product_id INTEGER,
        product_name TEXT NOT NULL,
        vendor TEXT NOT NULL,
        price REAL NOT NULL,
        quantity INTEGER NOT NULL,
        subtotal REAL NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id)
    );
`);

// =====================================================
// SAFE ADDITIVE MIGRATIONS — only adds if missing
// =====================================================
function addColumnIfMissing(table, column, definition) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    const exists = cols.some(c => c.name === column);
    if (!exists) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        console.log(`Migration: Added column ${column} to ${table}`);
    }
}

// Products: extra columns
addColumnIfMissing('products', 'image', "TEXT");
addColumnIfMissing('products', 'description', "TEXT");
addColumnIfMissing('products', 'stock', "INTEGER DEFAULT 10");
addColumnIfMissing('products', 'rating', "REAL DEFAULT 4.5");

// Vendors: auth
addColumnIfMissing('vendors', 'session_token', "TEXT");

// =====================================================
// EXTRA TABLES
// =====================================================
db.exec(`
    CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        user_name TEXT NOT NULL,
        rating INTEGER NOT NULL,
        review_text TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS coupons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        discount_pct INTEGER NOT NULL,
        is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS wishlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        product_id INTEGER NOT NULL,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id),
        UNIQUE(session_id, product_id)
    );
`);

// =====================================================
// SEED COUPONS (only if empty)
// =====================================================
const couponCount = db.prepare('SELECT COUNT(*) as count FROM coupons').get().count;
if (couponCount === 0) {
    db.exec(`
        INSERT INTO coupons (code, discount_pct) VALUES ('SHOP10', 10);
        INSERT INTO coupons (code, discount_pct) VALUES ('SAVE20', 20);
    `);
    console.log('Coupons seeded.');
}

// =====================================================
// SEED PRODUCTS (only if fewer than expected)
// =====================================================
const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get().count;

if (productCount === 0) {
    // Fresh database — insert all 6 products
    const insertProduct = db.prepare(`
        INSERT INTO products (name, price, category, vendor, icon, image, description, stock, rating)
        VALUES (@name, @price, @category, @vendor, @icon, @image, @description, @stock, @rating)
    `);

    const samples = [
        { name: "Wireless Headphones", price: 1499, category: "Electronics", vendor: "Tech World", icon: "🎧", image: "/images/products/wireless-headphones.jpg", description: "High quality wireless headphones with active noise cancellation.", stock: 50, rating: 4.5 },
        { name: "Smart Watch", price: 2499, category: "Electronics", vendor: "Digital Store", icon: "⌚", image: "/images/products/smart-watch.jpg", description: "Premium smart watch with fitness tracking and heart rate monitor.", stock: 30, rating: 4.5 },
        { name: "Running Shoes", price: 1999, category: "Fashion", vendor: "Sports Hub", icon: "👟", image: "/images/products/running-shoes.jpg", description: "Comfortable and durable running shoes for everyday use.", stock: 100, rating: 4.5 },
        { name: "Cotton T-Shirt", price: 799, category: "Fashion", vendor: "Sports Hub", icon: "👕", image: "/images/products/cotton-tshirt.jpg", description: "Soft breathable cotton t-shirt perfect for casual wear and workouts.", stock: 200, rating: 4.3 },
        { name: "Travel Backpack", price: 1299, category: "Fashion", vendor: "Sports Hub", icon: "🎒", image: "/images/products/backpack.jpg", description: "Durable 40L travel backpack with laptop compartment and water-resistant fabric.", stock: 75, rating: 4.6 },
        { name: "Yoga Mat", price: 999, category: "Sports", vendor: "Sports Hub", icon: "🧘", image: "/images/products/yoga-mat.jpg", description: "Non-slip eco-friendly yoga mat with alignment markings, 6mm thick.", stock: 120, rating: 4.4 }
    ];

    const insertMany = db.transaction((items) => {
        for (const item of items) insertProduct.run(item);
    });

    insertMany(samples);
    console.log("All 6 sample products added to SQLite database.");
} else if (productCount < 6) {
    // Database has existing products — add only missing ones by name
    const existingNames = db.prepare('SELECT name FROM products').all().map(r => r.name);
    
    const additionalProducts = [
        { name: "Cotton T-Shirt", price: 799, category: "Fashion", vendor: "Sports Hub", icon: "👕", image: "/images/products/cotton-tshirt.jpg", description: "Soft breathable cotton t-shirt perfect for casual wear and workouts.", stock: 200, rating: 4.3 },
        { name: "Travel Backpack", price: 1299, category: "Fashion", vendor: "Sports Hub", icon: "🎒", image: "/images/products/backpack.jpg", description: "Durable 40L travel backpack with laptop compartment and water-resistant fabric.", stock: 75, rating: 4.6 },
        { name: "Yoga Mat", price: 999, category: "Sports", vendor: "Sports Hub", icon: "🧘", image: "/images/products/yoga-mat.jpg", description: "Non-slip eco-friendly yoga mat with alignment markings, 6mm thick.", stock: 120, rating: 4.4 }
    ];

    const insertProduct = db.prepare(`
        INSERT INTO products (name, price, category, vendor, icon, image, description, stock, rating)
        VALUES (@name, @price, @category, @vendor, @icon, @image, @description, @stock, @rating)
    `);

    const addMissing = db.transaction((items) => {
        for (const item of items) {
            if (!existingNames.includes(item.name)) {
                insertProduct.run(item);
                console.log(`Added product: ${item.name}`);
            }
        }
    });

    addMissing(additionalProducts);
}

module.exports = db;
