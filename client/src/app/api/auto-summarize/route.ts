import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import ollama from 'ollama';
import { getDocumentProxy, extractText } from 'unpdf';
import { sendToKafka } from '@/lib/kafka';
import { uploadToMinio } from '@/lib/minio';
import { upsertToQdrant, initQdrantCollection } from '@/lib/qdrant';

const MAX_FILES = 20;
const CONCURRENCY = 2; // Process 2 files at a time to not overwhelm Ollama

interface FileSummary {
  filename: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  summary?: string;
  error?: string;
  tokens?: number;
}

async function extractFileContent(buffer: Buffer, filename: string): Promise<string> {
  if (filename.toLowerCase().endsWith('.pdf')) {
    const uint8Array = new Uint8Array(buffer);
    const pdfProxy = await getDocumentProxy(uint8Array);
    const result = await extractText(pdfProxy);
    return Array.isArray(result.text) ? result.text.join('\n') : (result.text || "");
  }
  return buffer.toString('utf-8');
}

async function summarizeWithOllama(content: string, filename: string, model: string): Promise<{ summary: string; tokens: number }> {
  const prompt = `You are an expert document analyst. Analyze the following document and provide a structured summary.

DOCUMENT: "${filename}"
---
${content.substring(0, 8000)}
---

Provide your analysis in this exact format:
## 📄 ${filename}

**Tür:** [Document type: Report, Contract, Research, Code, etc.]
**Sayfa/Uzunluk:** ~${Math.ceil(content.length / 3000)} sayfa
**Dil:** [Turkish/English/Other]

### Özet
[2-3 sentence executive summary]

### Kritik Bulgular
- [Key finding 1]
- [Key finding 2]
- [Key finding 3]

### Risk / Aksiyon Gerektiren Noktalar
- [Action item or risk, if any]

### Önem Derecesi: [🟢 Düşük / 🟡 Orta / 🔴 Yüksek]`;

  const response = await ollama.chat({
    model: model,
    messages: [{ role: 'user', content: prompt }],
    stream: false,
    options: { temperature: 0.2 }
  });

  const tokens = ((response as any).prompt_eval_count || 0) + ((response as any).eval_count || 0);
  return { summary: response.message.content, tokens };
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];
    const model = (formData.get('model') as string) || 'llama3.1';

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'Dosya yüklenmedi.' }, { status: 400 });
    }

    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `Maksimum ${MAX_FILES} dosya yükleyebilirsiniz.` }, { status: 400 });
    }

    // --- SSE Stream Response ---
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: any) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        const summaries: FileSummary[] = files.map(f => ({
          filename: f.name,
          status: 'pending' as const,
        }));

        // Send initial state
        send('init', { 
          totalFiles: files.length, 
          model,
          files: summaries.map(s => ({ filename: s.filename, status: s.status }))
        });

        // Process files with concurrency limit
        const processFile = async (file: File, index: number) => {
          const filename = file.name;
          summaries[index].status = 'processing';
          send('progress', { index, filename, status: 'processing', phase: 'reading' });

          try {
            // 1. Read file content
            const bytes = await file.arrayBuffer();
            const buffer = Buffer.from(bytes);
            const fileContent = await extractFileContent(buffer, filename);
            const cleanContent = fileContent.replace(/[\u0000-\u001F\u007F-\u009F]/g, " ");

            send('progress', { index, filename, status: 'processing', phase: 'uploading' });

            // 2. Save to tmp + MinIO
            const tmpDir = path.join(process.cwd(), 'tmp');
            if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
            const tmpPath = path.join(tmpDir, filename);
            fs.writeFileSync(tmpPath, buffer);

            try { await uploadToMinio('gitlawb-documents', filename, tmpPath); } catch (e) { /* MinIO optional */ }

            send('progress', { index, filename, status: 'processing', phase: 'kafka' });

            // 3. Kafka event
            try { 
              await sendToKafka('gitlawb-ingest', { 
                filename, 
                contentSnippet: cleanContent.substring(0, 500), 
                timestamp: new Date(),
                batchMode: true
              }); 
            } catch (e) { /* Kafka optional */ }

            send('progress', { index, filename, status: 'processing', phase: 'embedding' });

            // 4. Qdrant embedding
            try {
              await initQdrantCollection('documents');
              const embedResponse = await ollama.embeddings({ model: 'nomic-embed-text', prompt: cleanContent.substring(0, 10000) });
              await upsertToQdrant('documents', [{
                id: Math.floor(Math.random() * 1000000),
                vector: embedResponse.embedding,
                payload: { filename, content: cleanContent.substring(0, 2000), fullPath: `gitlawb-documents/${filename}` }
              }]);
            } catch (e) { /* Qdrant optional */ }

            send('progress', { index, filename, status: 'processing', phase: 'summarizing' });

            // 5. AI Summary (this is the critical step)
            const { summary, tokens } = await summarizeWithOllama(cleanContent, filename, model);
            
            summaries[index] = { filename, status: 'done', summary, tokens };
            send('summary', { index, filename, status: 'done', summary, tokens });

          } catch (err: any) {
            summaries[index] = { filename, status: 'error', error: err.message };
            send('summary', { index, filename, status: 'error', error: err.message });
          }
        };

        // Process with concurrency limit
        for (let i = 0; i < files.length; i += CONCURRENCY) {
          const batch = files.slice(i, i + CONCURRENCY);
          const promises = batch.map((file, j) => processFile(file, i + j));
          await Promise.all(promises);
        }

        // Generate consolidated report
        send('progress', { status: 'generating_report', phase: 'consolidating' });

        const completedSummaries = summaries.filter(s => s.status === 'done');
        
        if (completedSummaries.length > 0) {
          try {
            const consolidatedPrompt = `Sen bir üst düzey veri analisti ve raporlama uzmanısın. Aşağıda ${completedSummaries.length} belgenin özetleri var. Bunları birleştirerek profesyonel bir ÜST DÜZEY RAPOR hazırla.

${completedSummaries.map((s, i) => `--- BELGE ${i + 1}: ${s.filename} ---\n${s.summary}\n`).join('\n')}

RAPOR FORMATI:
# 📊 Birleşik Analiz Raporu
**Tarih:** ${new Date().toLocaleDateString('tr-TR')}
**Analiz Edilen Belgeler:** ${completedSummaries.length}

## Genel Değerlendirme
[Tüm belgelerin birlikte değerlendirilmesi — 3-4 cümle]

## Ortak Temalar & Bulgular
- [Tüm belgelerde tekrar eden ana tema]
- [İkinci ortak tema]

## Kritik Noktalar & Öneriler
1. [En önemli bulgu ve önerilen aksiyon]
2. [İkinci bulgu]

## Risk Değerlendirmesi
[Genel risk matriksi]

## Sonuç
[Kısa final değerlendirme]`;

            const consolidatedResponse = await ollama.chat({
              model: model,
              messages: [{ role: 'user', content: consolidatedPrompt }],
              stream: false,
              options: { temperature: 0.3 }
            });

            send('report', { 
              report: consolidatedResponse.message.content,
              totalFiles: files.length,
              successCount: completedSummaries.length,
              errorCount: summaries.filter(s => s.status === 'error').length,
              totalTokens: completedSummaries.reduce((acc, s) => acc + (s.tokens || 0), 0)
            });
          } catch (reportErr: any) {
            send('report', { 
              report: `Birleşik rapor oluşturulamadı: ${reportErr.message}`,
              totalFiles: files.length,
              successCount: completedSummaries.length,
              errorCount: summaries.filter(s => s.status === 'error').length,
            });
          }
        }

        send('done', { 
          totalFiles: files.length,
          completed: summaries.filter(s => s.status === 'done').length,
          errors: summaries.filter(s => s.status === 'error').length
        });

        controller.close();
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error('Auto-Summarize Error:', error);
    return NextResponse.json({ 
      error: error.message,
      hint: 'Ollama çalıştığından emin olun: ollama serve'
    }, { status: 500 });
  }
}
