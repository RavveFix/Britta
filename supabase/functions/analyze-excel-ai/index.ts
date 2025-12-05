// Claude + Python Excel Analysis - Smart & Accurate
// Excel → Claude (analys) → Python (verifiering) → Färdig rapport
/// <reference path="../../types/deno.d.ts" />

import { getCorsHeaders, createOptionsResponse } from "../../services/CorsService.ts";
import { createLogger } from "../../services/LoggerService.ts";
import { RateLimiterService } from "../../services/RateLimiterService.ts";

// @ts-expect-error - Deno npm: specifier
import { createClient } from "npm:@supabase/supabase-js@2";
// @ts-expect-error - Deno npm: specifier
import Anthropic from "npm:@anthropic-ai/sdk@0.32.1";
// @ts-expect-error - Deno npm: specifier
import * as XLSX from "npm:xlsx@0.18.5";

const logger = createLogger('analyze-excel-ai');

interface AnalyzeRequest {
  file_data: string;      // base64 encoded Excel
  filename: string;
  conversation_id?: string;
  company_name?: string;
  org_number?: string;
  period?: string;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders();

  if (req.method === "OPTIONS") {
    return createOptionsResponse();
  }

  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const sendProgress = async (data: Record<string, unknown>) => {
    await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  };

  (async () => {
    try {
      const body: AnalyzeRequest = await req.json();

      if (!body.file_data || !body.filename) {
        throw new Error('file_data and filename are required');
      }

      // Initialize Supabase
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

      // Get User ID from header
      const userId = req.headers.get('x-user-id');

      // Rate limiting
      const rateLimiter = new RateLimiterService(supabaseAdmin);
      const rateLimit = await rateLimiter.checkAndIncrement(userId || 'anonymous', 'analyze-excel-ai');

      if (!rateLimit.allowed) {
        throw new Error(`Rate limit exceeded: ${rateLimit.message}`);
      }

      // ═══════════════════════════════════════════════════════════════════
      // STEG 1: Läs Excel-fil
      // ═══════════════════════════════════════════════════════════════════
      await sendProgress({
        step: 'parsing',
        message: 'Läser Excel-fil...',
        progress: 0.1
      });

      let rawData: unknown[][];
      let columns: string[];
      let dataRows: unknown[][];

      try {
        const fileBuffer = Uint8Array.from(atob(body.file_data), c => c.charCodeAt(0));
        const workbook = XLSX.read(fileBuffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (!rawData || rawData.length < 2) {
          throw new Error('Excel-filen är tom eller saknar data');
        }

        columns = rawData[0] as string[];
        dataRows = rawData.slice(1);

        logger.info('Excel parsed', { rows: dataRows.length, columns: columns.length });
      } catch (parseError) {
        logger.error('Excel parsing failed', { error: parseError });
        throw new Error('Kunde inte läsa Excel-filen. Kontrollera formatet.');
      }

      // ═══════════════════════════════════════════════════════════════════
      // STEG 2: Claude analyserar ALLT
      // ═══════════════════════════════════════════════════════════════════
      await sendProgress({
        step: 'analyzing',
        message: 'Claude analyserar din data...',
        progress: 0.3
      });

      const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
      if (!anthropicKey) {
        throw new Error('ANTHROPIC_API_KEY not configured');
      }

      const anthropic = new Anthropic({ apiKey: anthropicKey });

      // Prepare data for Claude (max 100 rows to save tokens, full columns)
      const sampleRows = dataRows.slice(0, 100);
      const excelDataForClaude = {
        filename: body.filename,
        columns: columns,
        row_count: dataRows.length,
        sample_data: sampleRows.map(row => {
          const obj: Record<string, unknown> = {};
          columns.forEach((col, i) => {
            obj[col] = (row as unknown[])[i];
          });
          return obj;
        })
      };

      // Detect file type for adaptive prompt
      const fileContent = JSON.stringify(excelDataForClaude).toLowerCase();
      const isEvCharging = /monta|laddning|charging|kwh|ocpi|cpo|emsp|roaming|charge.*point|elbil/i.test(fileContent);

      const basePrompt = `Du är Britta, en svensk redovisningsexpert. Analysera denna Excel-fil och skapa en komplett momsrapport.

EXCEL-DATA:
${JSON.stringify(excelDataForClaude, null, 2)}

METADATA:
- Filnamn: ${body.filename}
- Företag: ${body.company_name || 'Ej angivet'}
- Org.nr: ${body.org_number || 'Ej angivet'}
- Period: ${body.period || 'Auto-detektera från data'}
- Totalt antal rader: ${dataRows.length}`;

      let specificInstructions: string;

      if (isEvCharging) {
        // ═══════════════════════════════════════════════════════════════
        // SPECIALISERAD PROMPT FÖR ELBILSLADDNING
        // ═══════════════════════════════════════════════════════════════
        specificInstructions = `
DIN UPPGIFT (Elbilsladdning/Monta):

VIKTIGT - MONTA TRANSAKTIONSLOGIK:
- **FÖRSÄLJNING (intäkter):** Rader där "amount" är POSITIVT och "to" innehåller "TEAM" (pengar IN till teamet)
- **KOSTNADER:** Rader där "amount" är NEGATIVT (pengar UT från teamet - avgifter, abonnemang)
- **reference** som börjar med "CHARGE |" = laddningssession (försäljning)
- **reference** som innehåller "SUBSCRIPTION" eller "fee" = kostnad

MOMS-REGLER FÖR ELBILSLADDNING:
- Om "roamingOperator" har ett värde (Plugsurfing, Easypark, etc.) → 0% moms (momsfri roaming/export)
- Om "roamingOperator" är tom OCH amount är positivt → 25% moms (privatkund)
- Kostnader (negativa belopp): räkna separat som ingående moms

1. **Kolumner i Monta-export:**
   - amount: Bruttobelopp (inkl moms) - POSITIVT = intäkt, NEGATIVT = kostnad
   - subAmount: Nettobelopp (exkl moms)
   - vat: Momsbelopp
   - vatRate: Momssats (25, 0)
   - kWh: Energi levererad
   - roamingOperator: Om ifyllt = roaming (0% moms)
   - reference: Transaktionstyp (CHARGE, SUBSCRIPTION, fee)
   - from/to: Vem som betalar till vem

2. **Beräkna FÖRSÄLJNING (endast positiva CHARGE-transaktioner):**
   - Privatkunder (25% moms): CHARGE där roamingOperator är tom
   - Roaming (0% moms): CHARGE där roamingOperator har värde

3. **Beräkna KOSTNADER (negativa belopp):**
   - Abonnemang (subscription)
   - Plattformsavgifter (platform fee)
   - Operatörsavgifter (operator fee)

4. **BAS-konton:**
   - 3010: Laddning privatkunder (25% moms)
   - 3011: Roaming-försäljning (0% moms, momsfri export)
   - 6590: Övriga externa tjänster (Monta-avgifter)
   - 2611: Utgående moms 25%
   - 2640: Ingående moms`;

      } else {
        // ═══════════════════════════════════════════════════════════════
        // GENERELL PROMPT FÖR ALLMÄN BOKFÖRING
        // ═══════════════════════════════════════════════════════════════
        specificInstructions = `
DIN UPPGIFT (Allmän bokföring):

1. **Identifiera kolumner automatiskt:**
   - Belopp: amount, total, belopp, summa
   - Moms: vat, moms
   - Momssats: vatRate, momssats
   - Datum: date, datum
   - Beskrivning: description, text, namn

2. **Beräkna svensk moms:**
   - 25% moms: Standard
   - 12% moms: Livsmedel, hotell
   - 6% moms: Böcker, kultur
   - 0% moms: Export, momsfritt
   - Summera per momssats

3. **BAS-konton (standard):**
   - 3001: Försäljning tjänster 25%
   - 3002: Försäljning varor 25%
   - 2611: Utgående moms 25%
   - 2621: Utgående moms 12%
   - 2631: Utgående moms 6%`;
      }

      const fullPrompt = `${basePrompt}

${specificInstructions}

SVARA MED EXAKT DENNA JSON-STRUKTUR:
{
  "success": true,
  "period": "YYYY-MM",
  "company_name": "Företagsnamn",
  "summary": {
    "total_sales": 315.10,
    "total_sales_vat": 16.29,
    "total_costs": 508.00,
    "total_costs_vat": 97.60,
    "result": -192.90,
    "total_kwh": 56.30,
    "roaming_sales": 233.65,
    "private_sales": 81.46,
    "roaming_count": 4,
    "private_count": 2
  },
  "vat_breakdown": [
    {
      "rate": 25,
      "type": "sale",
      "net_amount": 65.17,
      "vat_amount": 16.29,
      "gross_amount": 81.46,
      "transaction_count": 2,
      "bas_account": "3010",
      "description": "Privatladdning 25% moms"
    },
    {
      "rate": 0,
      "type": "sale",
      "net_amount": 233.65,
      "vat_amount": 0,
      "gross_amount": 233.65,
      "transaction_count": 4,
      "bas_account": "3011",
      "description": "Roaming-försäljning momsfri (OCPI)"
    },
    {
      "rate": 25,
      "type": "cost",
      "net_amount": 390.40,
      "vat_amount": 97.60,
      "gross_amount": 488.00,
      "transaction_count": 2,
      "bas_account": "6590",
      "description": "Abonnemang och avgifter"
    }
  ],
  "transactions": [
    {
      "amount": 40.95,
      "net_amount": 32.76,
      "vat_amount": 8.19,
      "vat_rate": 25,
      "description": "Laddning privatkund",
      "date": "2024-01-15",
      "type": "sale",
      "kwh": 9.1,
      "is_roaming": false
    },
    {
      "amount": 65.84,
      "net_amount": 65.84,
      "vat_amount": 0,
      "vat_rate": 0,
      "description": "Roaming Plugsurfing",
      "date": "2024-01-15",
      "type": "sale",
      "kwh": 13.3,
      "is_roaming": true
    },
    {
      "amount": -244.00,
      "net_amount": -195.20,
      "vat_amount": -48.80,
      "vat_rate": 25,
      "description": "Månadsabonnemang",
      "date": "2024-01-02",
      "type": "cost",
      "kwh": 0,
      "is_roaming": false
    }
  ],
  "validation": {
    "passed": true,
    "warnings": [],
    "notes": "Analysen baserad på Monta-export."
  }
}

VIKTIGT - BERÄKNINGSREGLER:
1. FÖRSÄLJNING = endast rader med POSITIVT amount där reference börjar med "CHARGE"
2. KOSTNADER = rader med NEGATIVT amount (subscriptions, fees)
3. Roaming = försäljning där roamingOperator har värde → 0% moms
4. Privat = försäljning där roamingOperator är tom → 25% moms
5. Alla belopp i SEK med 2 decimaler
6. Svara ENDAST med JSON, ingen annan text`;

      await sendProgress({
        step: 'calculating',
        message: isEvCharging
          ? 'Claude beräknar moms & kWh...'
          : 'Claude beräknar moms...',
        progress: 0.5
      });

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: fullPrompt }]
      });

      const claudeText = response.content[0].type === 'text' ? response.content[0].text : '';

      // Parse Claude's response
      let claudeReport: Record<string, unknown>;
      try {
        // Clean up potential markdown formatting
        const cleanJson = claudeText
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .trim();
        claudeReport = JSON.parse(cleanJson);
        logger.info('Claude analysis complete', {
          success: claudeReport.success,
          transactions: (claudeReport.transactions as unknown[])?.length || 0
        });
      } catch (parseError) {
        logger.error('Failed to parse Claude response', {
          error: parseError,
          response: claudeText.substring(0, 500)
        });
        throw new Error('Claude returnerade ogiltigt format. Försök igen.');
      }

      // ═══════════════════════════════════════════════════════════════════
      // STEG 3: Python verifierar beräkningarna
      // ═══════════════════════════════════════════════════════════════════
      await sendProgress({
        step: 'verifying',
        message: 'Python verifierar beräkningar...',
        progress: 0.7
      });

      const pythonApiUrl = Deno.env.get('PYTHON_API_URL');
      const pythonApiKey = Deno.env.get('PYTHON_API_KEY');

      let finalReport = claudeReport;
      let pythonVerified = false;

      if (pythonApiUrl && claudeReport.transactions) {
        try {
          const transactions = claudeReport.transactions as Array<{
            amount: number;
            net_amount: number;
            vat_amount: number;
            vat_rate: number;
            description?: string;
            date?: string;
            type?: string;
          }>;

          const pythonResponse = await fetch(`${pythonApiUrl}/api/v1/vat/calculate-normalized`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(pythonApiKey ? { 'X-API-Key': pythonApiKey } : {})
            },
            body: JSON.stringify({
              transactions: transactions.map(t => ({
                amount: t.amount,
                net_amount: t.net_amount,
                vat_amount: t.vat_amount,
                vat_rate: t.vat_rate,
                description: t.description || '',
                date: t.date || null,
                type: t.type || 'sale'
              })),
              company_name: claudeReport.company_name || body.company_name || 'Företag',
              org_number: body.org_number || '',
              period: claudeReport.period || body.period || new Date().toISOString().substring(0, 7)
            })
          });

          if (pythonResponse.ok) {
            const pythonResult = await pythonResponse.json();
            pythonVerified = true;

            // Merge Python's exact calculations with Claude's analysis
            const pythonData = pythonResult.data;
            const claudeSummary = claudeReport.summary as Record<string, unknown>;
            const pythonSummary = pythonData?.summary || {};

            // Use Python's exact numbers, keep Claude's enrichments (kWh, etc)
            finalReport = {
              ...claudeReport,
              summary: {
                ...claudeSummary,
                // Python's exact calculations
                total_sales: pythonSummary.total_amount || claudeSummary.total_sales,
                total_vat: pythonSummary.total_vat || claudeSummary.total_vat,
                total_net: pythonSummary.total_net || claudeSummary.total_net,
                // Keep Claude's enrichments
                total_kwh: claudeSummary.total_kwh,
                avg_price_per_kwh: claudeSummary.avg_price_per_kwh,
                roaming_count: claudeSummary.roaming_count,
                private_count: claudeSummary.private_count
              },
              // Use Python's VAT breakdown if available
              vat_breakdown: pythonData?.vat || claudeReport.vat_breakdown,
              python_verified: true
            };

            logger.info('Python verification complete', {
              claude_total: claudeSummary.total_vat,
              python_total: pythonSummary.total_vat
            });
          } else {
            logger.warn('Python verification failed, using Claude results', {
              status: pythonResponse.status
            });
          }
        } catch (pythonError) {
          logger.warn('Python API error, using Claude results', { error: pythonError });
        }
      }

      // Add verification status to report
      const report = {
        ...finalReport,
        verification: {
          python_verified: pythonVerified,
          method: pythonVerified ? 'claude+python' : 'claude-only'
        }
      };

      // ═══════════════════════════════════════════════════════════════════
      // STEG 4: Spara till databas (om användare är inloggad)
      // ═══════════════════════════════════════════════════════════════════
      if (userId && body.conversation_id) {
        await sendProgress({
          step: 'saving',
          message: 'Sparar rapport...',
          progress: 0.9
        });

        const { error: dbError } = await supabaseAdmin
          .from('vat_reports')
          .insert({
            user_id: userId,
            conversation_id: body.conversation_id,
            period: (finalReport as Record<string, unknown>).period || body.period,
            company_name: (finalReport as Record<string, unknown>).company_name || body.company_name,
            report_data: report,
            source_filename: body.filename
          });

        if (dbError) {
          logger.warn('Failed to save report', { error: dbError });
        }
      }

      // ═══════════════════════════════════════════════════════════════════
      // KLART!
      // ═══════════════════════════════════════════════════════════════════
      await sendProgress({
        step: 'complete',
        message: 'Analys klar!',
        progress: 1.0,
        report: {
          success: true,
          data: report,
          metadata: {
            filename: body.filename,
            rows_analyzed: dataRows.length,
            file_type: isEvCharging ? 'ev_charging' : 'general',
            ai_model: 'claude-sonnet-4-20250514'
          }
        }
      });

      await writer.close();

    } catch (error) {
      logger.error('Analysis failed', { error });
      await sendProgress({
        step: 'error',
        error: error instanceof Error ? error.message : 'Okänt fel uppstod'
      });
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
});
