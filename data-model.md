markdown
# QuickNotes Relational Schema Data Model Design

This blueprint establishes a relational schema design for QuickNotes to support consistent transactions, fast lookup structures, and clear foreign references across data fields.

## 1. Relational Framework Context (SQL vs NoSQL Evaluation)
We chose a **relational database engine (specifically PostgreSQL)** over a NoSQL document database for the target storage layer. QuickNotes has clear entity relationships (Users map to Notes, Notes link to multiple cross-referenced Tags). Relational databases provide full transactional ACID compliance, which prevents data anomalies during concurrent operations. Utilizing structured schema enforcement blocks unvalidated or corrupt inputs from persisting to disk storage, while efficient join keys avoid the data duplication common in NoSQL designs.

---

## 2. Entity Relational Structural Definitions
The data engine features four highly normalized relational model contexts:

*   **`users`**: Records system actor accounts.
    *   Columns: `id` (INT PK, Auto-Increment), `email` (VARCHAR 150, Unique, Indexed), `password_hash` (VARCHAR 255), `created_at` (TIMESTAMP).
*   **`notes`**: Holds user-generated content records.
    *   Columns: `id` (INT PK, Auto-Increment), `user_id` (INT FK targeting `users.id`), `title` (VARCHAR 100), `body` (TEXT), `created_at` (TIMESTAMP).
*   **`tags`**: Stores system organization categories.
    *   Columns: `id` (INT PK, Auto-Increment), `name` (VARCHAR 30, Unique), `created_at` (TIMESTAMP).
*   **`note_tags`**: A junction table that resolves the many-to-many relationship between Notes and Tags.
    *   Columns: `note_id` (INT FK targeting `notes.id`), `tag_id` (INT FK targeting `tags.id`).
    *   Key Constraints: Composite Primary Key (`note_id`, `tag_id`).

### Structural Relationships Matrix
*   **One-to-Many (`users` ➔ `notes`)**: A single user can create and own multiple notes. If a user deletes their account, their cascading foreign key rule (`ON DELETE CASCADE`) ensures their notes are safely purged as well.
*   **Many-to-Many (`notes` ⇄ `tags`)**: A single note can have many tags, and a single tag can apply to many notes. This relationship is managed by the associative junction table `note_tags`.

---

## 3. Data Definition Language (DDL) Scripts
```sql
-- Establish core independent entities first
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(30) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Establish dependent child entity collections
CREATE TABLE notes (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(100) NOT NULL,
    body TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_note_owner FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Establish associative junction relationship mapping matrices
CREATE TABLE note_tags (
    note_id INT NOT NULL,
    tag_id INT NOT NULL,
    PRIMARY KEY (note_id, tag_id),
    CONSTRAINT fk_junction_note FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
    CONSTRAINT fk_junction_tag FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
```

---

## 4. Example Production SQL Queries

### A. Insert a New User Transaction
```sql
INSERT INTO users (email, password_hash) 
VALUES ('dev_engineer@quicknotes.io', '$2b$12$EjKzS9mGvO8R1WxzC...');
```

### B. Fetch All Available Unique Tags
```sql
SELECT id, name FROM tags ORDER BY name ASC;
```

### C. Relational JOIN Query (Fetch Notes with Associated Tag Arrays)
This optimized query pulls a user's notes along with all associated tags using relational table joins.
```sql
SELECT 
    n.id AS note_identifier,
    n.title AS note_title,
    n.body AS note_body,
    COALESCE(string_agg(t.name, ', '), 'No Tags Assigned') AS associated_tags
FROM notes n
LEFT JOIN note_tags nt ON n.id = nt.note_id
LEFT JOIN tags t ON nt.tag_id = t.id
WHERE n.user_id = 1402
GROUP BY n.id
ORDER BY n.created_at DESC;
```

---

## 5. Indexing Optimizations
```sql
CREATE INDEX idx_notes_user_id ON notes(user_id);
```
*   **Reasoning and Strategy**: Users frequently query their own list of notes, making `SELECT * FROM notes WHERE user_id = :id` a high-frequency operation. Without an explicit secondary index, PostgreSQL must perform an \(O(N)\) full-table scan for every request. Adding a B-Tree index reduces lookup complexity to a fast \(O(\log N)\) operation, which prevents performance bottlenecks as the system scales to millions of rows.