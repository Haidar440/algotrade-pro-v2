# 📘 AlgoTrade Pro — Codebase Guide

> **Goal:** Help you understand the code easily by explaining **"How it works"** rather than just "What it is".

This guide breaks down the project by **Real-World Use Cases**.

---

## 1. 🚦 The "Main" Entry Point
**File:** `backend/app/main.py`
*   **Simple Explanation:** This is the front door. When you run `python run.py`, this file starts.
*   **What it does:**
    *   It's like a receptionist. It says "Welcome to AlgoTrade Pro".
    *   It wakes up the database (`lifespan` startup).
    *   It connects all the different "departments" (Routers) like Auth, Trades, Broker.
    *   It sets up the security guards (Middleware) to check every request.

---

## 2. 🔐 Use Case: "I want to Login"
**Files Involved:**
1.  `app/routers/auth.py` (The Counter)
2.  `app/security/auth.py` (The ID Card Maker)
3.  `app/models/schemas.py` (The Application Form)

**How it flows:**
1.  You send your username/password to the **Router** (`routers/auth.py`).
2.  The Router checks if the password matches the hash (using `security/auth.py`).
3.  If yes, the **ID Card Maker** (`create_access_token` in `security/auth.py`) prints a digital ID card (JWT Token).
4.  You get this Token. Now, for every other request, you show this Token to prove who you are.

---

## 3. 🛡️ Use Case: "Connecting a Broker (Angel One)"
**Files Involved:**
1.  `app/routers/broker.py` (The Command Center)
2.  `app/services/broker_factory.py` (The Hiring Manager)
3.  `app/services/angel_broker.py` (The Specialist)
4.  `app/security/vault.py` (The Safe)

**How it flows:**
1.  You tell the **Command Center** (`routers/broker.py`): "Connect to Angel One".
2.  The center asks the **Hiring Manager** (`broker_factory.py`) to get an Angel One expert.
3.  The manager hires `AngelOneBroker`.
4.  The system pulls your encrypted password from the **Safe** (`vault.py`) — it was never stored as plain text.
5.  The **Specialist** (`angel_broker.py`) takes these credentials, talks to Angel One's servers, and establishes a secure line.
6.  Session established! Credentials are burned (deleted from memory) immediately after connection.

---

## 4. 💰 Use Case: "Placing a Buy Order" (The Big One)
**Files Involved:**
1.  `app/routers/broker.py` (The Order Desk)
2.  `app/services/risk_manager.py` (The Safety Inspector)
3.  `app/services/broker_interface.py` (The Standard Form)
4.  `app/services/angel_broker.py` (The Executing Agent)

**How it flows:**
1.  You submit a "Buy 10 RELIANCE" request to the **Order Desk**.
2.  **STOP!** Before anything happens, the **Safety Inspector** (`risk_manager.py`) steps in.
    *   *Inspector:* "Is the Kill Switch on?" (No)
    *   *Inspector:* "Do you have enough money?" (Yes)
    *   *Inspector:* "Did you lose too much today?" (No)
    *   *Inspector:* "Is this trade too risky (Concentration)?" (No)
3.  Only if the Inspector says "APPROVED", the order goes through.
4.  The order is written on a **Standard Form** (`OrderRequest` in `broker_interface.py`) so every broker understands it.
5.  The **Executing Agent** (`angel_broker.py`) translates this form into Angel One's specific language and sends it to the exchange.
6.  Success! You get an Order ID back.

---

## 5. 📝 Use Case: "Paper Trading" (Production Practice)
**File:** `app/services/paper_trader.py`
*   **Concept:** A flight simulator for trading.
*   **Key Feature:** The "Hard Wall".
    *   Inside the code, there is a strict rule: `assert self._real_broker is None`.
    *   This guarantees that the Paper Trader **physically cannot** talk to a real broker. It plays with monopoly money (₹1,00,000) entirely in its own memory.
*   **Why?** So you can test risky strategies without losing a single rupee.

---

## 6. ⚙️ The "Brain" of the Operation
**File:** `app/config.py`
*   **Purpose:** The Rulebook.
*   **Why it's important:**
    *   It is the **ONLY** place that reads your `.env` file.
    *   If you put a secret password in `.env`, `config.py` reads it and gives it to the app.
    *   It fails fast: if you forget a critical key (like `DATABASE_URL`), the app refuses to start. It protects you from running a broken system.

---

## 7. 📚 The "Dictionary"
**File:** `app/constants.py`
*   **Purpose:** To make sure we all speak the same language.
*   **Example:** Instead of typing "BUY" everywhere (and maybe typing "Buy" or "buy" by mistake), we use `OrderSide.BUY`.
*   If you misspell it in code, the app won't run. This prevents thousands of bugs.

---

## Summary of Folders
*   `app/routers/`: **The Front Desk** (API Endpoints).
*   `app/services/`: **The Workers** (Business Logic, Brokers, Risk).
*   `app/models/`: **The Data Structure** (Database Tables).
*   `app/security/`: **The Guards** (Auth, Encryption).
*   `scripts/`: **The Tools** (Testing, Verification).
