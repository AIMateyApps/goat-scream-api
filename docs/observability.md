# Observability & Metrics

This guide covers structured logging, metrics aggregation, and dashboard setup for monitoring the Goat Screams API.

## Structured Logs

All requests emit JSON logs to `logs/app.log` with fields `request_id`, `method`, `path`, `status`, `duration_ms`, `ip`, and `timestamp`.

- **View locally**: `tail -f logs/app.log`
- **Forward to Loki/ELK**: Ship log file or configure a sidecar collector

## Aggregated Stats

Run `node scripts/aggregate-stats.js` (or `pnpm run stats:aggregate`) to snapshot curated scream metrics.

- Snapshots stored in `stats/daily-YYYY-MM-DD.json` with top downloads and daily hits
- Load snapshots into Grafana/ELK by pointing at the `stats/` directory

## Prometheus Metrics

The API exposes Prometheus metrics at `/metrics` endpoint with the following metrics:

- `http_requests_total` - Total HTTP requests by method, path, status
- `http_request_duration_seconds` - Request duration histogram
- `http_active_connections` - Current active connections gauge
- `http_errors_total` - Error count by type and status
- `cache_hits_total` - Cache hits counter
- `cache_misses_total` - Cache misses counter
- `cache_hit_rate` - Cache hit rate percentage (0-100)
- `cache_operations_total` - All cache operations (get, set, del, clear)

### Grafana Dashboard

A pre-configured Grafana dashboard is available at `docs/grafana-dashboard.json`. To use it:

1. **Import dashboard**: In Grafana, go to Dashboards → Import → Upload JSON file
2. **Select Prometheus datasource**: Configure the dashboard to use your Prometheus datasource
3. **Configure panels**: The dashboard includes:
   - HTTP request rate and duration (p50, p95, p99)
   - Active connections
   - Error rate by type
   - Cache hit rate and operations
   - Status code distribution
   - Top request paths
   - System metrics (CPU, memory)

## Dashboard Setup (Grafana + Loki)

1. **Start Loki & Grafana** (optional): Add services to `docker-compose.yml` or use a hosted stack
2. **Configure Loki datasource** to read from `logs/app.log` (via promtail or vector)
3. **Build panels**:
   - **Request rate by path**: `sum by (path) (count_over_time({filename="/app/logs/app.log"}[1m]))`
   - **Average latency**: `avg by (path) (rate({filename="/app/logs/app.log"} | json | unwrap duration_ms [5m]))`
   - **Top callers**: `topk(5, sum by (ip) (count_over_time({filename="/app/logs/app.log"}[10m])))`
4. **Import stats snapshots**: Add JSON datasource plugin and point at `stats/` folder

## Suggested Dashboards

- **Operations Overview**: Combine request rate, error rate (filter `status >= 500`), pending submissions (from `/health`), and Cloudinary usage
- **Content Trends**: Chart `top_downloads` and `top_daily_hits` from aggregated snapshots to track popularity

_Last updated: 2025-10-16_
