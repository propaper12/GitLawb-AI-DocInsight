import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import ollama from 'ollama';
import { getDocumentProxy, extractText } from 'unpdf';
import { sendToKafka } from '@/lib/kafka';
import { uploadToMinio } from '@/lib/minio';
import { upsertToQdrant, initQdrantCollection } from '@/lib/qdrant';

export async function POST(req: Request) {
  let stage = 'Initialization';
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const content = formData.get('content') as string;
    const topic = (formData.get('topic') as string) || 'gitlawb-ingest';

    let fileName = '';
    let fileContent = '';

    stage = 'File Processing';
    if (file) {
      fileName = file.name;
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      
      if (fileName.toLowerCase().endsWith('.pdf')) {
        stage = 'PDF Text Extraction (unpdf)';
        try {
          // unpdf requires Uint8Array specifically
          const uint8Array = new Uint8Array(buffer);
          const pdfProxy = await getDocumentProxy(uint8Array);
          const result = await extractText(pdfProxy);
          // Handle both string and array of strings
          fileContent = Array.isArray(result.text) ? result.text.join('\n') : (result.text || "");
        } catch (pdfErr: any) {
          throw new Error(`PDF Parsing Error (unpdf): ${pdfErr.message}`);
        }
      } else {
        fileContent = buffer.toString('utf-8');
      }
      
      const tmpDir = path.join(process.cwd(), 'tmp');
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);
      const tmpPath = path.join(tmpDir, fileName);
      fs.writeFileSync(tmpPath, buffer);
      
      stage = 'MinIO Upload';
      await uploadToMinio('gitlawb-documents', fileName, tmpPath);
    } else if (content) {
      stage = 'Text Processing';
      fileName = `text-${Date.now()}.txt`;
      fileContent = content;
      
      const tmpDir = path.join(process.cwd(), 'tmp');
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);
      const tmpPath = path.join(tmpDir, fileName);
      fs.writeFileSync(tmpPath, content);
      
      stage = 'MinIO Upload (Text)';
      await uploadToMinio('gitlawb-documents', fileName, tmpPath);
    } else {
      return NextResponse.json({ error: 'No content or file provided' }, { status: 400 });
    }

    // Clean text for Kafka/Qdrant
    const cleanContent = fileContent.replace(/[\u0000-\u001F\u007F-\u009F]/g, " ");

    stage = 'Kafka Streaming';
    await sendToKafka(topic, { 
      filename: fileName, 
      contentSnippet: cleanContent.substring(0, 500), 
      timestamp: new Date() 
    });

    stage = 'Qdrant Collection Init';
    await initQdrantCollection('documents');
    
    stage = 'Ollama Embedding Generation & Chunking';
    const chunkSize = 1500;
    const overlap = 200;
    const chunks = [];
    
    // Create overlapping chunks
    for (let i = 0; i < cleanContent.length; i += (chunkSize - overlap)) {
      const chunk = cleanContent.substring(i, i + chunkSize).trim();
      if (chunk.length > 50) { // skip very small chunks
        chunks.push(chunk);
      }
    }
    
    // If somehow no chunks were created (e.g. empty file), add a dummy chunk
    if (chunks.length === 0) chunks.push("Empty Document");

    const points = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedResponse = await ollama.embeddings({ 
        model: 'nomic-embed-text', 
        prompt: chunk
      });
      
      points.push({
        id: Math.floor(Math.random() * 1000000000) + i, // Unique enough for this demo
        vector: embedResponse.embedding,
        payload: { 
          filename: fileName, 
          chunkIndex: i,
          totalChunks: chunks.length,
          content: chunk,
          fullPath: `gitlawb-documents/${fileName}`
        }
      });
    }
    
    stage = 'Qdrant Upsert';
    // Upsert in batches to prevent payload too large errors
    const BATCH_SIZE = 50;
    for (let i = 0; i < points.length; i += BATCH_SIZE) {
      await upsertToQdrant('documents', points.slice(i, i + BATCH_SIZE));
    }

    return NextResponse.json({ 
      success: true, 
      message: `Successfully ingested ${fileName} (${chunks.length} chunks)`,
      details: { minio: true, kafka: true, qdrant: true, chunks: chunks.length }
    });

  } catch (error: any) {
    console.error(`Error at ${stage}:`, error);
    return NextResponse.json({ 
      success: false,
      error: error.message, 
      stage: stage,
    }, { status: 500 });
  }
}
