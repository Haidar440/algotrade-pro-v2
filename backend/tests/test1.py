import asyncio
import aiohttp
import time
import json

# --- CONFIGURATION ---
BASE_URL = "http://localhost:8000/api"
TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsImlhdCI6MTc3NTg0NDMzNSwiZXhwIjoxNzc1ODQ3OTM1LCJ0eXBlIjoiYWNjZXNzIn0.nNsG2G-XV25gVOg_vCuudbmDuBbVqD_MvwwKzLpoooI" # Paste your JWT token here from Step 2

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json"
}

# --- HELPER FUNCTIONS ---
async def fetch(session, method, endpoint, payload=None):
    """Makes an HTTP request and measures the exact execution time."""
    url = f"{BASE_URL}{endpoint}"
    start_time = time.time()
    
    try:
        if method == "GET":
            async with session.get(url, headers=HEADERS) as response:
                status = response.status
                data = await response.json()
        elif method == "POST":
            async with session.post(url, headers=HEADERS, json=payload) as response:
                status = response.status
                data = await response.json()
                
        elapsed_time = time.time() - start_time
        return status, data, elapsed_time
    except Exception as e:
        elapsed_time = time.time() - start_time
        return 500, {"error": str(e)}, elapsed_time

# --- TEST MATRIX RUNNERS ---

async def test_1_event_loop_blocking(session):
    print("\n--- TEST 1: Event Loop Blocking Detection ---")
    print("Firing Heavy (/ai/analyze/RELIANCE) + Light (/ai/market/indices) concurrently...")
    
    # Fire both at the exact same time
    heavy_task = asyncio.create_task(fetch(session, "GET", "/ai/analyze/RELIANCE"))
    light_task = asyncio.create_task(fetch(session, "GET", "/ai/market/indices"))
    
    light_status, light_data, light_time = await light_task
    heavy_status, heavy_data, heavy_time = await heavy_task
    
    print(f"Light Request Time: {light_time:.3f}s (Target: < 0.500s)")
    print(f"Heavy Request Time: {heavy_time:.3f}s")
    
    if light_time < 0.5:
        print("✅ PASS: Event loop is free! Light request was not blocked.")
    else:
        print("❌ FAIL: Event loop blocked! Light request waited for heavy request.")

async def test_2_and_6_cache_performance(session):
    print("\n--- TEST 2 & 6: Latency & Cache Hit Verification ---")
    print("Making 2 sequential calls to /ai/market/indices...")
    
    # First Call (Cold Cache)
    status1, data1, time1 = await fetch(session, "GET", "/ai/market/indices")
    print(f"Call 1 (Cold): {time1:.3f}s")
    
    # Second Call (Warm Cache)
    status2, data2, time2 = await fetch(session, "GET", "/ai/market/indices")
    print(f"Call 2 (Warm): {time2:.3f}s (Target: < 0.100s)")
    
    if time2 < (time1 / 2) and time2 < 0.2:
        print("✅ PASS: Cache is working perfectly.")
    else:
        print("❌ FAIL: Cache missed or is not significantly faster.")

async def test_3_concurrent_load(session):
    print("\n--- TEST 3: Concurrent Load Test (3 Heavy + 1 Light) ---")
    
    # 3 Heavy tasks
    tasks = [
        asyncio.create_task(fetch(session, "GET", "/ai/analyze/TCS")),
        asyncio.create_task(fetch(session, "GET", "/ai/analyze/INFY")),
        asyncio.create_task(fetch(session, "GET", "/ai/analyze/HDFCBANK"))
    ]
    
    # Wait 0.5 seconds, then fire a light task
    await asyncio.sleep(0.5)
    light_task = asyncio.create_task(fetch(session, "GET", "/watchlists/quotes")) # Adjust endpoint if needed
    
    light_status, light_data, light_time = await light_task
    print(f"Light Request Time (under heavy load): {light_time:.3f}s")
    
    if light_time < 1.0:
        print("✅ PASS: UI remains responsive under heavy concurrent load.")
    else:
        print("❌ FAIL: UI slowed down under load.")
        
    # Clean up heavy tasks
    await asyncio.gather(*tasks)

async def test_4_taskmanager_polling(session):
    print("\n--- TEST 4: TaskManager 202 Polling ---")
    
    payload = {
        "symbol": "RELIANCE",
        "strategy": "ema_adx",
        "timeframe": "1d"
    }
    
    print("Triggering Optimization...")
    status, data, _ = await fetch(session, "POST", "/backtest/optimize", payload)
    
    if status != 202:
        print(f"❌ FAIL: Expected 202 Accepted, got {status}. Data: {data}")
        return
        
    task_id = data.get("task_id")
    print(f"✅ PASS: Received 202 Accepted with task_id: {task_id}")
    
    # Polling Loop
    for i in range(5):
        await asyncio.sleep(2) # Poll every 2 seconds
        p_status, p_data, _ = await fetch(session, "GET", f"/backtest/status/{task_id}")
        task_status = p_data.get("status")
        
        print(f"Poll {i+1}: Status -> {task_status}")
        
        if task_status == "completed":
            print("✅ PASS: Background task completed successfully.")
            return
        elif task_status == "failed":
            print("❌ FAIL: Background task failed.")
            return
            
    print("⚠️ WARNING: Task did not complete within the polling window.")

# --- MAIN EXECUTION ---
async def main():
    if TOKEN == "YOUR_JWT_TOKEN_HERE":
        print("⚠️ ERROR: Please set your JWT TOKEN at the top of the script first.")
        return

    print("🚀 Starting Async Performance Verification Suite...")
    
    # Use a custom connector to avoid connection limiting on our end during load tests
    connector = aiohttp.TCPConnector(limit=50)
    async with aiohttp.ClientSession(connector=connector) as session:
        await test_2_and_6_cache_performance(session)
        await test_1_event_loop_blocking(session)
        await test_3_concurrent_load(session)
        # Note: Uncomment Test 4 once the 202-Accepted endpoints are fully coded
        # await test_4_taskmanager_polling(session)

    print("\n🏁 Test Suite Finished.")

if __name__ == "__main__":
    asyncio.run(main())