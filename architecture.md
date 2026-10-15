markdown
# QuickNotes Production Architecture System Design

This blueprint covers how the QuickNotes architecture can handle a load of 1 million registered users.

## 1. Architectural System Requirements

### Functional Requirements
*   Users must be able to securely register accounts, create, edit, look up, and delete notes.
*   Users must be able to append, detach, and sort records using tags.

### Non-Functional Requirements
*   **High Availability**: The system targets 99.99% operational availability across target availability zones.
*   **Low Latency Limits**: P95 read paths should return sub-100ms responses to ensure smooth user interactions.
*   **Scalable Core Strategy**: The system must support horizontal scaling across the application layer to easily accommodate future user spikes.

---

## 2. Load and Capacity Calculations

*   **Target User Base**: 1,000,000 registered accounts.
*   **Active Daily Ratio (DAU)**: Assumed to be 50% (500,000 active daily profiles).

### A. Network Throughput Volume Calculations
*   **Read Traffic Parameters**: Assume each daily active user views their note collection 4 times a day.
    $$\text{Total Daily Reads} = 500,000 \times 4 = 2,000,000 \text{ reads/day}$$
    $$\text{Average Read Throughput} = \frac{2,000,000}{86,400 \text{ seconds}} \approx 23.15 \text{ requests per second (RPS)}$$

*   **Write Traffic Parameters**: Assume each daily active user creates or updates 1 note a day.
    $$\text{Total Daily Writes} = 500,000 \times 1 = 500,000 \text{ writes/day}$$
    $$\text{Average Write Throughput} = \frac{500,000}{86,400 \text{ seconds}} \approx 5.79 \text{ requests per second (RPS)}$$

### B. Storage Footprint Accumulation Projections
*   Assume the raw textual content, metadata markers, and relational columns average **2 KB per note instance**.
    $$\text{Daily Storage Additions} = 500,000 \text{ notes} \times 2 \text{ KB} = 1,000,000 \text{ KB} \approx 1 \text{ GB per day}$$
    $$\text{Annual Baseline Footprint} = 1 \text{ GB/day} \times 365 \text{ days} = 365 \text{ GB per year}$$

---

## 3. High-Level Infrastructure Topology Diagram

[ Client Applications ]
│
[ Anycast DNS Matrix ]
│
[ Global CDN Edge Wall ]
│
[ Nginx Load Balancer Tier ]
(Active / Passive Failover)
│
┌───────────────────┴───────────────────┐
▼                                       ▼
[ App Server 1 ]                        [ App Server 2 ]
(Node.js Cluster)                       (Node.js Cluster)
│          │                            │          │
│          └──────────────┬─────────────┘          │
▼                         ▼                        ▼
[ Redis Cache Wall ]    [ Message Broker Queue ]    [ Write DB Primary ]
(Master/Replica Sync)        (RabbitMQ Cluster)       (PostgreSQL Core)
│                         │                        │
▼                         ▼                        ▼
[ Read DB Replica ]      [ Async Task Worker ]     [ WAL Storage Volume ]


---

## 4. Component Definitions and Isolation Roles
*   **Anycast DNS Matrix**: Translates domain addresses to server virtual IPs using fast routing pathways.
*   **Global CDN Edge Wall**: Serves frontend files (HTML, CSS, JS) from nearby edge servers, reducing server load.
*   **Nginx Load Balancer Tier**: Distributes incoming API requests across downstream application clusters using a round-robin strategy.
*   **App Server Clusters**: Stateless compute nodes that execute core business logic, handle token validation, and run input sanitization checks.
*   **Redis Cache Wall**: An in-memory cache that intercepts frequent read queries, protecting database storage volumes from read bottlenecks.
*   **Write DB Primary (PostgreSQL Core)**: The authoritative data store that handles all data changes and transaction records.
*   **Read DB Replica**: Asynchronously duplicates records from the write primary to handle high-frequency data reads.
*   **RabbitMQ Message Broker Queue**: Collects slow or resource-heavy application tasks, keeping them off the main request loop.
*   **Async Task Worker**: Independent processes that consume tasks from the queue, managing actions like PDF backups and search indexing.

---

## 5. End-to-End Core Step Request Flows

### Fetch User Notes Index Route Flow (`GET /notes`)
1. The client browser initiates a request that passes through the Anycast DNS to the **Nginx Load Balancer**.
2. Nginx routes the request to an available **App Server** node.
3. The App Server validates the request's JWT token and looks for the requested note data inside the **Redis Cache Wall**.
4. **Cache Hit**: Data returns instantly to the client (\(<10\text{ms}\) execution step).
5. **Cache Miss**: The App Server queries the **Read DB Replica**, populates the Redis cache for next time, and returns the note data back to the client application.

### Create New Note Route Flow (`POST /notes`)
1. The client submits a note form payload to the **Nginx Load Balancer Tier**.
2. Nginx forwards the traffic payload to a live stateless **App Server**.
3. The App Server runs validation checks, sanitizes strings, and writes the note records directly to the **Write DB Primary**.
4. The Write DB Primary asynchronously streams updates to the **Read DB Replica** via write-ahead logs (WAL).
5. The App Server clears out stale cached entries inside the **Redis Cache Wall**, ensures data consistency, and sends a `201 Created` status response back to the user.

---

## 6. Architecture Trade-offs and System Resilience Metrics

### A. Trade-off: Eventual Consistency for Scale Lookups
By using database read replicas, changes made on the write primary take a few milliseconds to sync with the read replicas. This means a user who refreshes immediately after writing a note might view older data for a tiny fraction of a second. This slight compromise ensures the database can scale to handle massive concurrent read traffic.

### B. Single Point of Failure (SPOF) Removal Strategies
*   **Load Balancer Safety**: We use a secondary standby Nginx instance that monitors the main load balancer. If the active server fails, the standby instantly takes over using floating IP keepalived protocols.
*   **Compute Tier Resiliency**: Application servers run in an auto-scaling group across different physical data centers. If one zone experiences an outage, traffic automatically re-routes to the remaining data centers without any downtime.
*   **Database Failover Protection**: The PostgreSQL primary cluster uses active health checks. If the primary write node fails, a read replica is promoted to primary write authority, which protects the application from data loss and extended downtime.