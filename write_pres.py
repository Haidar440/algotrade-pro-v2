import os

content = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AlgoTrade Pro - Presentation</title>
    <!-- Reveal.js core CSS -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/reveal.js/4.3.1/reset.min.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/reveal.js/4.3.1/reveal.min.css">
    <!-- Reveal.js Theme - Blood/Dark -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/reveal.js/4.3.1/theme/blood.min.css" id="theme">
    <!-- Font Awesome -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <!-- Google Fonts -->
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&family=Roboto:wght@300;400;500&display=swap" rel="stylesheet">
    <style>
        .reveal {
            font-family: 'Roboto', sans-serif;
        }
        .reveal h1, .reveal h2, .reveal h3, .reveal h4, .reveal h5, .reveal h6 {
            font-family: 'Montserrat', sans-serif;
            text-transform: none;
            letter-spacing: normal;
        }
        .custom-slide {
            text-align: left;
        }
        .reveal .slide-title {
            color: #e04040;
            border-bottom: 2px solid #e04040;
            padding-bottom: 10px;
            margin-bottom: 30px;
            font-size: 2.2em;
        }
        .title-slide h1 {
            color: #ffffff;
            font-size: 2.8em;
            margin-bottom: 20px;
        }
        .title-slide .subtitle {
            color: #e04040;
            font-size: 1.2em;
            margin-bottom: 40px;
        }
        .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            font-size: 0.6em;
            text-align: left;
            background: rgba(0, 0, 0, 0.4);
            padding: 25px;
            border-radius: 10px;
            border-left: 5px solid #e04040;
        }
        .info-item span {
            color: #aaaaaa;
            display: block;
            margin-bottom: 5px;
            text-transform: uppercase;
            font-size: 0.8em;
            letter-spacing: 1px;
        }
        .info-item strong {
            color: #ffffff;
            font-size: 1.2em;
            font-family: 'Montserrat', sans-serif;
        }
        .reveal ul {
            display: block;
        }
        .reveal li {
            margin-bottom: 15px;
            font-size: 0.85em;
        }
        .icon-text {
            color: #e04040;
            margin-right: 15px;
            width: 30px;
            text-align: center;
        }
        .feature-box {
            background: rgba(0, 0, 0, 0.4);
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            border-left: 4px solid #e04040;
        }
        .feature-box h4 {
            margin-top: 0;
            color: #fff;
            font-size: 1.1em;
            display: flex;
            align-items: center;
            gap: 15px;
        }
        .architecture-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-top: 30px;
        }
        .arch-card {
            background: rgba(255, 255, 255, 0.05);
            padding: 20px;
            border-radius: 10px;
            text-align: center;
        }
        .arch-card i {
            font-size: 2.5em;
            color: #e04040;
            margin-bottom: 15px;
            display: block;
        }
        .arch-card h4 {
            font-size: 1em;
            margin: 0 0 10px 0;
            color: #fff;
        }
        .arch-card p {
            font-size: 0.6em;
            margin: 0;
            color: #bbb;
        }
        .table-custom {
            width: 100%;
            font-size: 0.7em;
            border-collapse: collapse;
            background: rgba(0,0,0,0.4);
            border-radius: 8px;
            overflow: hidden;
        }
        .table-custom th {
            background: rgba(224, 64, 64, 0.2);
            color: #fff;
            padding: 15px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .table-custom td {
            padding: 15px;
            border-bottom: 1px solid rgba(255,255,255,0.05);
        }
    </style>
</head>
<body>
    <div class="reveal">
        <div class="slides">

            <!-- SLIDE 1: Title -->
            <section class="title-slide">
                <i class="fa-solid fa-chart-line" style="font-size: 3em; color: #e04040; margin-bottom: 20px;"></i>
                <h1>AlgoTrade Pro</h1>
                <div class="subtitle">A Production-Grade Algorithmic Trading Platform</div>
                
                <div class="info-grid">
                    <div class="info-item">
                        <span>Student details</span>
                        <strong>Sunasara Haidarali</strong><br>
                        Reg No: 2411022250090
                    </div>
                    <div class="info-item">
                        <span>Department</span>
                        <strong>Computer Science & Engineering</strong>
                    </div>
                    <div class="info-item">
                        <span>Internal Guide</span>
                        <strong>Ms. Nagasri</strong>
                    </div>
                    <div class="info-item">
                        <span>External Guide</span>
                        <strong>[Company Specialist / Add Name Here]</strong>
                    </div>
                    <div class="info-item">
                        <span>Company Details</span>
                        <strong>[Company Name]</strong>
                    </div>
                    <div class="info-item">
                        <span>Date</span>
                        <strong>April 22, 2026</strong>
                    </div>
                </div>
            </section>

            <!-- SLIDE 2: Introduction -->
            <section class="custom-slide">
                <h2 class="slide-title">Introduction</h2>
                <p style="font-size: 0.9em; line-height: 1.6;">
                    <strong>AlgoTrade Pro</strong> is a sophisticated algorithmic trading platform built specifically for the Indian stock markets (NSE/BSE). It bridges the gap between advanced real-time trading metrics and an intuitive user interface.
                </p>
                <div class="feature-box" style="margin-top: 30px;">
                    <ul style="list-style-type: none; margin: 0; padding: 0;">
                        <li><i class="fa-solid fa-server icon-text"></i> Live Market Streaming connectivity via strict WebSocket protocols.</li>
                        <li><i class="fa-solid fa-robot icon-text"></i> Automated execution with Backtesting support.</li>
                        <li><i class="fa-solid fa-brain icon-text"></i> AI-infused analysis utilizing Google Gemini Search Grounding.</li>
                        <li><i class="fa-solid fa-shield-halved icon-text"></i> Enterprise-grade AES-256 Vault Encryption for API key protection.</li>
                    </ul>
                </div>
            </section>

            <!-- SLIDE 3: Aim / Objectives -->
            <section class="custom-slide">
                <h2 class="slide-title">Aim & Objectives</h2>
                <ul>
                    <li><i class="fa-solid fa-bullseye icon-text"></i> <strong>Primary Aim:</strong> To build a scalable, low-latency automated trading ecosystem that eliminates emotional trading via data-driven intelligence.</li>
                    <br>
                    <li><i class="fa-solid fa-check icon-text"></i> Provide <strong>seamless real-time stock data streaming</strong> to interactive dashboards.</li>
                    <li><i class="fa-solid fa-check icon-text"></i> Formulate structured <strong>technical analysis pipelines</strong> offering over 130 indicators.</li>
                    <li><i class="fa-solid fa-check icon-text"></i> Embed <strong>comprehensive Risk Management</strong> limits (e.g. Max Order Value: ₹1L, Max Daily Loss: ₹5K).</li>
                    <li><i class="fa-solid fa-check icon-text"></i> Facilitate an isolated <strong>paper-trading environment</strong> to evaluate strategies before live deployment.</li>
                </ul>
            </section>

            <!-- SLIDE 4: Analysis -->
            <section class="custom-slide">
                <h2 class="slide-title">Analysis Phase</h2>
                <div class="feature-box">
                    <h4><i class="fa-solid fa-magnifying-glass-chart"></i> Market Data & Quant Processing</h4>
                    <p style="font-size: 0.7em;">Complex market tick data must be aggregated gracefully. We leverage Python's <strong>pandas-ta</strong> framework to supply technical scoring formulas matching professional grade requirements continuously.</p>
                </div>
                <div class="feature-box">
                    <h4><i class="fa-solid fa-microchip"></i> AI-Driven Insights</h4>
                    <p style="font-size: 0.7em;">Utilizing a 10-layer scoring model integrating Google Gemini 2.0 Flash for semantic stock news grounding and sentiment parsing, empowering traders to foresee sudden fundamental shifts.</p>
                </div>
                <div class="feature-box">
                    <h4><i class="fa-solid fa-gauge-high"></i> Performance Modeling</h4>
                    <p style="font-size: 0.7em;">Analysis identified the critical need for a non-blocking architecture, solved by implementing ASGI (Uvicorn), enabling the API to sustain concurrent streaming ticks without locking REST capabilities.</p>
                </div>
            </section>

            <!-- SLIDE 5: Design -->
            <section class="custom-slide">
                <h2 class="slide-title">System Design & Architecture</h2>
                <div class="architecture-grid">
                    <div class="arch-card">
                        <i class="fa-brands fa-react"></i>
                        <h4>Frontend Layer</h4>
                        <p>React 18 + TypeScript (Vite). TailwindCSS styling, component-based Native WebSocket subscriptions, and secure JWT-locked rendering.</p>
                    </div>
                    <div class="arch-card">
                        <i class="fa-brands fa-python"></i>
                        <h4>Backend Layer</h4>
                        <p>FastAPI (Python 3.13) powering asynchronous paths. Heavy data isolation via dedicated Router architecture (Auth, WebSockets, Broker).</p>
                    </div>
                    <div class="arch-card">
                        <i class="fa-solid fa-database"></i>
                        <h4>Database Layer</h4>
                        <p>PostgreSQL with asyncpg & SQLAlchemy ORM. Optimized queries handling relational trade histories and watchlist schemas.</p>
                    </div>
                    <div class="arch-card">
                        <i class="fa-solid fa-lock"></i>
                        <h4>Security & Broker</h4>
                        <p>Angel One / Zerodha SmartAPI mappings encapsulated in AES-256 Vault algorithms protecting sensitive broker tokens.</p>
                    </div>
                </div>
            </section>

            <!-- SLIDE 6: Test Cases -->
            <section class="custom-slide">
                <h2 class="slide-title">System Test Cases</h2>
                <table class="table-custom">
                    <thead>
                        <tr>
                            <th>Test ID</th>
                            <th>Description</th>
                            <th>Expected Result</th>
                            <th>Status/Result</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><strong>TC_01</strong></td>
                            <td>WebSocket latency capability against high concurrency streaming.</td>
                            <td>Render delay remains &lt; 50ms without UI freezing.</td>
                            <td><i class="fa-solid fa-check" style="color: #4CAF50;"></i> Pass</td>
                        </tr>
                        <tr>
                            <td><strong>TC_02</strong></td>
                            <td>Risk Management boundary trigger.</td>
                            <td>Order > ₹1,00,000 correctly flagged and halted by risk_manager.py.</td>
                            <td><i class="fa-solid fa-check" style="color: #4CAF50;"></i> Pass</td>
                        </tr>
                        <tr>
                            <td><strong>TC_03</strong></td>
                            <td>AES-256 Vault Encryption & Decryption on credentials.</td>
                            <td>Brokers tokens are verified safely encrypted at rest.</td>
                            <td><i class="fa-solid fa-check" style="color: #4CAF50;"></i> Pass</td>
                        </tr>
                        <tr>
                            <td><strong>TC_04</strong></td>
                            <td>Paper Trading separation functionality.</td>
                            <td>Paper trades do not accidentally log as Live market executions.</td>
                            <td><i class="fa-solid fa-check" style="color: #4CAF50;"></i> Pass</td>
                        </tr>
                    </tbody>
                </table>
            </section>

            <!-- SLIDE 7: What you have Learnt -->
            <section class="custom-slide">
                <h2 class="slide-title">What I Have Learnt</h2>
                <ul style="font-size: 0.9em; line-height: 1.5;">
                    <li><i class="fa-solid fa-graduation-cap icon-text"></i> <strong>Async Programming:</strong> Gained deep understanding of asynchronous execution loops in Python using FastAPI's `async def` paired with `asyncpg` for PostgreSQL.</li>
                    <li><i class="fa-solid fa-graduation-cap icon-text"></i> <strong>Real-Time Systems:</strong> Successfully orchestrated bidirectional real-time Data feeds using WebSockets connecting direct broker pipelines to React UIs.</li>
                    <li><i class="fa-solid fa-graduation-cap icon-text"></i> <strong>Generative AI Integration:</strong> Discovered how to engineer precise LLM prompts and integrate Google Gemini API to analyze raw structured financial signals.</li>
                    <li><i class="fa-solid fa-graduation-cap icon-text"></i> <strong>Security Standard:</strong> Grasped proper handling of sensitive authentication states (JWT caching, Fernet AES-256 cryptography) for zero-trust environments.</li>
                </ul>
            </section>

            <!-- SLIDE 8: Conclusion -->
            <section class="custom-slide">
                <h2 class="slide-title">Conclusion</h2>
                <p style="font-size: 0.9em; line-height: 1.5; background: rgba(0,0,0,0.4); padding: 25px; border-radius: 8px; border-left: 5px solid #e04040;">
                    <strong>AlgoTrade Pro</strong> successfully meets the demands of modern algorithmic trading by abstracting highly volatile execution loops into a coherent, highly-responsive application.<br><br>
                    By coupling rigorous <strong>technical/quantitative risk management rules</strong> with the <strong>exploratory intelligence of AI</strong>, the project serves as a highly resilient and powerful platform ready for scalable, real-world deployment on Indian Exchanges.
                </p>
                <div style="text-align: center; margin-top: 40px; color: #e04040;">
                    <h3 style="margin-bottom: 0px;"><i class="fa-regular fa-handshake"></i> Thank You</h3>
                    <p style="font-size: 0.5em; color: #aaa; margin-top: 5px;">Open for Questions</p>
                </div>
            </section>

        </div>
    </div>

    <!-- Reveal.js Scripts -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/reveal.js/4.3.1/reveal.min.js"></script>
    <script>
        Reveal.initialize({
            controls: true,
            progress: true,
            center: true,
            hash: true,
            transition: 'slide', // none/fade/slide/convex/concave/zoom
            // Customize to a dark stock app feel
            backgroundTransition: 'fade'
        });
    </script>
</body>
</html>"""

with open("e:/algotrade-pro/presentation.html", "w", encoding="utf-8") as f:
    f.write(content)
