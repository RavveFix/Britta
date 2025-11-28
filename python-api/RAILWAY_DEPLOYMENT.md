# Railway Deployment Info

## Production URL
```
https://britta-production.up.railway.app
```

## API Endpoints

### Health Check
```bash
curl https://britta-production.up.railway.app/health
```

Response:
```json
{"status":"healthy","service":"britta-vat-api"}
```

### VAT Analysis
```bash
POST https://britta-production.up.railway.app/api/v1/vat/analyze
Content-Type: application/json

{
  "file_data": "base64-encoded-excel-file",
  "filename": "transactions.xlsx",
  "company_name": "Företag AB",
  "org_number": "5561839191",
  "period": "2025-11"
}
```

## Deployment Details

- **Platform**: Railway
- **Region**: europe-west4 (Drams3a)
- **Root Directory**: `python-api`
- **Runtime**: Python 3.13
- **Framework**: FastAPI + Uvicorn
- **Workers**: 2

## Status

✅ **Phase 2 Complete**: Railway deployment successful
- Pandas compatibility fixed (>=2.2.3 for Python 3.13)
- Swedish VAT processor module integrated
- Public domain generated and tested
- Health endpoint responding correctly

## Next Steps: Phase 3 - Supabase Integration

1. Create Supabase Edge Function `python-proxy`
2. Add Railway URL as environment variable in Supabase
3. Create PythonAPIService.ts in Supabase services
4. Update frontend to offer Python API option for VAT analysis
5. Test end-to-end VAT report generation

## Deployment Date
2025-11-28
