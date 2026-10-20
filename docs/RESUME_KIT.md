# Zipli Pro — Senior & Staff Software Engineer Resume & Interview Kit

> **Purpose**: High-impact resume accomplishment bullet points, system design interview talking points, and portfolio walkthrough scripts based on the Zipli Pro Quick-Commerce engineering architecture.

---

## 1. Resume Accomplishment Bullets (STAR Format)

### For Senior / Staff Backend & Distributed Systems Engineer
- **Engineered an in-memory Okapi BM25 search engine and 26-way Radix Trie** in pure JavaScript for a quick-commerce catalog of 100,000 SKUs, delivering **13,900+ req/sec** at **3.44 ms p50 latency** and achieving a **2.4x throughput speedup** over sequential PostgreSQL scans.
- **Eliminated inventory overselling during high-concurrency flash surges (0% oversell under 1,000+ simultaneous checkouts)** by designing a dynamic stock reservation engine with 10-minute automated TTL leases and PostgreSQL `SELECT ... FOR UPDATE` row-level transactional locking.
- **Architected a delivery dispatch and routing intelligence engine** combining Kuhn-Munkres (Hungarian algorithm) bipartite matching, $A^*$ city-graph heuristic routing, and 2-Opt TSP optimization, slashing fleet delivery transit mileage by **22.4%** and multi-drop batch travel by **54.4%**.
- **Designed a two-tier adaptive cache layer (L1 in-process LRU/LFU + L2 Redis)** with single-flight mutex coalescing, reducing database query load by **79.7%** under Zipfian power-law demand and completely eliminating thundering-herd cache stampedes.
- **Implemented a zero-dependency recommendation engine** utilizing FP-Growth frequent itemset mining and inverted cosine collaborative filtering, mining association rules across 40,000 orders in **70 ms** with an **8.0% catalog coverage** and **76.2% Hit-Rate@10**.
- **Built an automated demand forecasting and inventory replenishment pipeline** using Holt-Winters triple exponential smoothing and FEFO perishable batch allocation, improving demand forecast accuracy by **13.8% sMAPE** and reducing food spoilage waste by **87.6%**.
- **Guaranteed dual-write consistency and at-least-once event delivery semantics with idempotent consumers** by implementing the Transactional Outbox Pattern with BullMQ exponential backoff dead-letter queues (DLQ), ensuring durable message processing without split-brain anomalies or duplicate writes.
- **Hardened platform security and auditability** with a cryptographic SHA-256 audit hash chain, Kirsch-Mitzenmacher double-hash Bloom filters, and GCRA leaky bucket rate limiters capable of evaluating **9.1M req/sec**.

---

### For Full-Stack Tech Lead
- **Architected a production-grade Vanilla JavaScript ES Module frontend** with zero build tools or compile-time overhead, maintaining a design system of 18 reusable components, dark/light theme switching, and strict CSP compliance with zero inline handlers.
- **Built an automated multi-viewport Playwright E2E test suite** running across Desktop (1280px), Tablet (768px), and Mobile (360px), achieving 100% test pass rate alongside a 92-suite, 845-test backend testing harness with 95% algorithm test coverage.
- **Orchestrated a containerized production deployment** using Docker Compose, hardened non-root Alpine runtimes, Nginx HTTP/2 reverse-proxying with Gzip compression, and an automated GitHub Actions CI/CD pipeline.

---

## 2. System Design Interview Talking Points & Deep Dives

### Question 1: "Why build an in-memory search engine in Node.js instead of spinning up Elasticsearch or using Postgres Full-Text Search?"
> **Talking Point**:  
> "In quick-commerce (10-15 minute delivery), latency SLAs are under 5ms, and dark store inventory is localized to small-to-medium catalogs (~10,000 to 100,000 active SKUs per store).  
> 1. **PostgreSQL full-text search (`tsvector`) or `ILIKE`**: Under high concurrency (10,000 req/sec), disk I/O and index cache contention create severe p99 tail latency spikes (often > 50ms) and saturate the connection pool needed for transactional checkout.  
> 2. **Elasticsearch / OpenSearch**: Introduces operational overhead (JVM tuning, multi-node cluster management, split-brain recovery, and replication lag between Postgres and ES).  
> 3. **Zipli Pro's Solution**: A pure in-memory inverted index with Okapi BM25 ranking, a 26-way Radix Trie for prefix autocomplete, and a BK-Tree for discrete Levenshtein typo recovery. At 100,000 items, the entire search index consumes only ~425 MB of heap memory, executes searches in 1.18 ms, and handles 13,900 req/sec in-process with zero network hops."

---

### Question 2: "How do you solve the inventory overselling problem when 1,000 users attempt to purchase the last 5 units of milk simultaneously?"
> **Talking Point**:  
> "We implement a **Two-Phase Inventory Hold Lease**:  
> - **Phase 1 (Stock Hold at Checkout)**: When a user initiates checkout, an atomic non-blocking reservation record is created with a 10-minute lease (`expires_at = NOW() + INTERVAL '10 minutes'`). Available stock is dynamically computed as:  
>   $$\text{Available Stock} = \text{Physical On-Hand Stock} - \sum \text{Active Reservations}$$  
>   If available stock is zero, the user is rejected immediately without acquiring expensive locks.  
> - **Phase 2 (Pessimistic Finalization)**: During order creation, a single ACID transaction acquires a row-level lock (`SELECT stock FROM products WHERE id = $1 FOR UPDATE`). The reservation is marked `FULFILLED` and the physical stock is decremented.  
> - **Reconciliation**: A background sweeper automatically expires stale leases every 60 seconds. In our stress tests with 1,000 concurrent checkout attempts on limited inventory, overselling was strictly **0.00%**."

---

### Question 3: "Why did you choose the Hungarian Algorithm (Kuhn-Munkres) for delivery dispatch over nearest-neighbor greedy matching?"
> **Talking Point**:  
> "Greedy nearest-driver assignment is locally optimal but globally inefficient. A greedy algorithm assigns the closest rider to Order A, but can force Order B to wait for a rider 15 minutes away, increasing aggregate fleet travel and causing SLA breaches.  
> The Hungarian Algorithm (Kuhn-Munkres) models order-to-rider dispatch as a **minimum-cost bipartite matching problem** in $O(N^3)$ polynomial time. In our delivery intelligence benchmarks with 50 drivers and 25 pending orders, Kuhn-Munkres achieved a **22.39% lower aggregate fleet travel distance** than greedy matching, significantly improving 10-minute delivery compliance."

---

### Question 4: "How does your Transactional Outbox Pattern ensure reliability without distributed two-phase commits (2PC)?"
> **Talking Point**:  
> "Dual-writes between a relational database and a message broker (e.g. updating PostgreSQL and emitting to Redis/Kafka) inherently suffer from partial failure: the database write can succeed while the broker write fails, or vice-versa. Two-phase commit (2PC) introduces unacceptable latency and blocking coordinators.  
> With the **Transactional Outbox Pattern**, every domain state change (such as `CREATE ORDER`) inserts an event row into an `outbox_events` table within the **exact same PostgreSQL transaction**. An asynchronous outbox relay service polls pending events with row-level locks (`FOR UPDATE SKIP LOCKED`), publishes them to BullMQ/Redis with exponential backoff and dead-letter queues (DLQ), and marks them `PUBLISHED`. This guarantees zero dual-write inconsistencies and at-least-once delivery semantics."

---

### Question 5: "How does your caching strategy prevent the 'Thundering Herd' / Cache Stampede problem?"
> **Talking Point**:  
> "When a high-demand cache key expires (such as a flash deal on milk during morning rush), hundreds of concurrent requests simultaneously observe a cache miss and all query the database simultaneously, causing database connection exhaustion.  
> We solve this using **Single-Flight Mutex Coalescing**:  
> When a cache miss occurs, the loader function checks an internal in-flight map. If a database query for that key is already executing, subsequent incoming requests subscribe to the **same pending Promise** rather than issuing duplicate queries. In our cache benchmark with 100 concurrent requests, exactly **1 database read** was executed, and all 100 callers received identical results in 25 ms."

---

## 3. Ten-Minute Portfolio Walkthrough Script

| Time | Phase | Focus Areas & Visual Walkthrough |
|:-----|:------|:---------------------------------|
| **0:00 – 1:30** | **Introduction & Problem Statement** | The 10-minute quick-commerce problem: extreme concurrency, low inventory margins, strict SLAs, and why bloated microservices fail. |
| **1:30 – 3:30** | **In-Memory Algorithmic Core** | Live demo of Trie autocomplete, BM25 catalog search, and BK-Tree typo recovery. Share benchmark results: 13.9k req/sec at 3.4ms p50. |
| **3:30 – 5:30** | **Inventory & Checkout Atomicity** | Explain the 10-minute dynamic stock reservation lease, row-level locking, and zero-oversell guarantee under stress. |
| **5:30 – 7:00** | **Delivery & Dispatch Intelligence** | Walk through Kuhn-Munkres bipartite matching, A* routing, and 2-Opt TSP order batching. Show distance reduction numbers (22.4% & 54.4%). |
| **7:00 – 8:30** | **Reliability, Security & Caching** | Highlight Transactional Outbox, BullMQ DLQ, SHA-256 audit hash chain, and single-flight cache stampede protection. |
| **8:30 – 10:00**| **Frontend & Verification Harness** | Showcase vanilla ES Modules frontend, `/styleguide.html` 18-component design system, and 12-test Playwright E2E suite across 3 viewports. |
