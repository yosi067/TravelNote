# Travel OS

Personal Travel OS is a local Docker-based prototype for a future-ready travel archive and planning system. The first phase simulates a production-style CDN split: Nginx is the gateway, static files are served directly at the edge, `/api/*` traffic is proxied to Node.js, and PostgreSQL stores persistent trip data in a named Docker volume.

## 專案願景

Travel OS 是一套個人旅遊雲端系統原型，目標同時管理「過去旅行回憶資產庫」與「未來行程規劃時間線」。第一階段先建立可攜式的本地開發架構，讓專案之後可以在 MacBook Pro M2 或 Windows 11 WSL2 之間移動，並用 Docker Compose 模擬正式環境常見的 CDN、Gateway、API、Database 分層。

視覺方向採用 Apple Premium Aesthetic：極簡黑白、系統字體、大留白、柔和陰影、12px/16px 圓角、`backdrop-filter: blur(20px)` 毛玻璃，以及地圖標記與時間線互動的細緻微動效。前端目前先建立可工作的高質感基底，之後再接入 Google Maps API 與更完整的 Canvas/Timeline 體驗。

## 繁體中文架構說明

```text
gateway   -> Nginx Alpine，唯一公開入口，模擬 CDN 邊緣節點與靜態快取
frontend  -> Node.js Alpine + Vite，前端熱更新，負責地圖舞台、毛玻璃 UI、時間線
backend   -> Node.js Alpine + Express + nodemon，REST API、資料初始化、排程提醒
database  -> PostgreSQL Alpine，使用 Docker named volume 保存旅遊資料
```

請求流向：

```text
Browser
	-> gateway:80
		-> static assets 由 Nginx 直接回傳
		-> /api/* 反向代理到 backend:3000
	-> backend 連線 database:5432
```

目前 `gateway` 是建議入口，因為它最接近未來正式部署時的動靜分離模式。`frontend` 的 Vite port 仍保留給開發時直接檢查熱更新使用。

## Architecture

```text
gateway   -> Nginx Alpine, public entrypoint, static edge cache simulation
frontend  -> Node.js Alpine + Vite, hot-reloadable local UI workspace
backend   -> Node.js Alpine + Express + nodemon, REST API and scheduler
database  -> PostgreSQL Alpine, persistent named volume
```

## 目前進度

- 已建立 `docker-compose.yml`，包含 `gateway`、`frontend`、`backend`、`database` 四個服務。
- 已設定每個服務從 `.env` 讀取 port、資料庫連線與硬體資源限制，記憶體上限預設皆不超過 500MB。
- 已建立 Nginx reverse proxy：靜態資源由 gateway 直接服務，`/api/*` 轉發到 backend。
- 已建立前端 Apple 風格基底：滿版地圖舞台、毛玻璃頂部列、右側資訊面板、底部時間線、新增旅程抽屜表單。
- 已建立後端 Express API：`GET/POST/PUT/DELETE /api/trips`、`/api/health`、`/api/notifications`。
- 已完成 PostgreSQL 自動建表與 seed 邏輯，首次啟動會預填 London、Reykjavik、Da Nang 三筆旅遊資料。
- 已加入簡易未來行程掃描排程，每小時檢查當日 future trip 並建立通知資料。
- 已補上 Mac/Windows 可用的 Docker 啟動文件；目前 Windows 家用版環境無法在此機驗證 Docker 實跑，建議改在 MacBook Pro M2 繼續。

## 接下來要做的事情

- 在 MacBook Pro M2 安裝 Docker Desktop，clone 此 repo，並由 `.env.example` 複製建立本機 `.env`。
- 在 Mac 上執行 `docker compose up --build`，確認 gateway、frontend、backend、database 都能正常啟動。
- 串接 Google Maps JavaScript API，用 `.env` 的 `Maps_API_KEY` 載入正式地圖。
- 將目前的 CSS 地圖舞台替換為可互動 Google Map，並套用暗黑或極簡淺灰 map style。
- 強化時間線：改為 Canvas 或更細緻的 DOM inertia scroll，補上 Past/Future 分段與 Today 呼吸燈定位邏輯。
- 擴充 CRUD：加入編輯、刪除、照片 URL 預覽、表單防呆、同步狀態提示與錯誤處理。
- 將 `/api/notifications` 與前端 Web Notification 串接，讓未來行程提醒能在瀏覽器顯示。
- 補上測試與資料驗證，例如 API integration tests、schema migration 策略、前端互動檢查。

## Project Structure

```text
.
├── .env
├── .env.example
├── docker-compose.yml
├── gateway/
│   └── nginx.conf
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── index.html
│       └── app.js
└── backend/
	├── Dockerfile
	├── package.json
	└── src/
		└── server.js
```

## Local Setup

1. Install Docker Desktop.
2. Open this folder in VS Code.
3. Copy `.env.example` to `.env`.
4. Edit `.env` and replace `Maps_API_KEY` when you are ready to wire Google Maps.
5. Keep each `*_MEM_LIMIT` value at or below `500m` for lightweight MacBook Pro and Windows 11 WSL2 development.

## MacBook Pro M2 接手步驟

1. 安裝 Docker Desktop for Mac，並確認 Docker Engine 已啟動。
2. Clone 專案：`git clone https://github.com/yosi067/TravelNote.git`。
3. 進入資料夾：`cd TravelNote`。
4. 建立本機環境檔：`cp .env.example .env`。
5. 若已經有 Google Maps API key，打開 `.env` 填入 `Maps_API_KEY`；還沒有也可以先保留 placeholder。
6. 啟動整套架構：`docker compose up --build`。
7. 打開 http://localhost:8080 檢查 gateway 入口。

## Start Everything

Run this command from the project root:

```bash
docker compose up --build
```

Then open:

- Gateway app: http://localhost:8080
- Direct frontend dev server: http://localhost:5173
- Backend health check: http://localhost:3000/api/health

The gateway is the recommended entrypoint because it serves static frontend assets directly and reverse-proxies `/api/*` to the backend container.

## Database Behavior

On backend startup, the API automatically:

- Waits for PostgreSQL to become available.
- Creates the `trips` table if it does not exist.
- Seeds London, Reykjavik, and Da Nang sample trips when the table is empty.
- Scans future trips hourly and stores reminder notifications in memory at `/api/notifications`.

Trip data persists in the Docker named volume `postgres_data`.

## Useful Commands

```bash
docker compose ps
docker compose logs -f backend
docker compose down
```

To reset the local database completely:

```bash
docker compose down -v
```
