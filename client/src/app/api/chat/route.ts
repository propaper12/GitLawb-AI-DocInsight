import { NextResponse } from 'next/server';
import ollama from 'ollama';
import { searchQdrant } from '@/lib/qdrant';

export async function POST(req: Request) {
  try {
    const { messages, model } = await req.json();
    
    // Extract last user message to query Qdrant
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content || '';
    
    let retrievedContext = '';
    if (lastUserMessage) {
      try {
        const embedResponse = await ollama.embeddings({ 
          model: 'nomic-embed-text', 
          prompt: lastUserMessage 
        });
        
        try {
          const qdrantResults = await searchQdrant('documents', embedResponse.embedding, 5);
          if (qdrantResults && qdrantResults.length > 0) {
            retrievedContext = qdrantResults.map((r: any, i: number) => 
              `[BELGE ${i+1}] Dosya: ${r.payload?.filename || 'Bilinmiyor'} | İçerik: ${r.payload?.content || ''}`
            ).join('\n\n');
          }
        } catch (e: any) {
          console.warn('Qdrant Search Error (might be empty):', e.message);
        }
      } catch (e: any) {
        console.warn('Embedding error for RAG:', e.message);
      }
    }
    
    let systemPrompt = `You are GitLawb AI, a world-class Enterprise Data Analyst and Big Data Specialist.
Your goal is to help the user interpret, summarize, and extract actionable insights from large-scale data and documents stored in the Kafka-MinIO-Qdrant pipeline.

GUIDELINES:
1. FOCUS: You are NO LONGER a coding assistant. Do not write code or debug software unless specifically asked to analyze a technical document.
2. TOOLS: Always suggest using search or analysis tools if the user asks about uploaded documents.
3. OUTPUT: Provide structured analytical reports, executive summaries, and SWOT-like assessments for every document.
4. TONE: Professional, analytical, and business-oriented. Be concise but deep in your insights.
5. CONTEXT: You have full access to the document storage and vector database for semantic retrieval. Always prioritize the 'Internal Data' context.
6. LANGUAGE: ALWAYS respond in fully natural, native, and grammatically correct Turkish (MÜKEMMEL VE DOĞAL BİR TÜRKÇE KULLAN)!`;

    if (retrievedContext) {
      systemPrompt += `\n\n=== ŞİRKET/VERİ SETİ BAĞLAMI (BUNU KULLANARAK CEVAP VER) ===\n${retrievedContext}\n============================================================`;
    }

    const fullMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    // Perform chat request with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000); // 2 min timeout

    let response;
    try {
      response = await ollama.chat({
        model: model || 'llama3.1',
        messages: fullMessages,
        stream: false,
      });
    } catch (ollamaErr: any) {
      clearTimeout(timeout);
      
      // Check for connection errors
      if (ollamaErr.cause?.code === 'ECONNREFUSED' || 
          ollamaErr.message?.includes('ECONNREFUSED') ||
          ollamaErr.message?.includes('fetch failed') ||
          ollamaErr.code === 'ECONNREFUSED') {
        return NextResponse.json({ 
          message: { 
            role: 'assistant', 
            content: `⚠️ **Ollama bağlantısı kurulamadı.**\n\nOllama sunucusu çalışmıyor olabilir. Lütfen terminalde şu komutu çalıştır:\n\n\`\`\`bash\nollama serve\n\`\`\`\n\nArdından modelin yüklü olduğundan emin ol:\n\n\`\`\`bash\nollama pull ${model || 'llama3.1'}\n\`\`\`\n\nEğer Docker kullanıyorsan, container'ın çalıştığını kontrol et.`
          },
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, duration: '0' }
        });
      }
      
      throw ollamaErr; // Re-throw other errors
    }
    
    clearTimeout(timeout);

    // Extract detailed token usage
    const usage = {
      prompt_tokens: (response as any).prompt_eval_count || 0,
      completion_tokens: (response as any).eval_count || 0,
      total_tokens: ((response as any).prompt_eval_count || 0) + ((response as any).eval_count || 0),
      duration: (response as any).total_duration ? ((response as any).total_duration / 1e9).toFixed(2) : '0'
    };

    return NextResponse.json({ 
      message: response.message,
      usage: usage
    });
  } catch (error: any) {
    console.error('Ollama Error:', error);
    return NextResponse.json({ 
      message: { 
        role: 'assistant', 
        content: `❌ **Beklenmeyen bir hata oluştu:**\n\n${error.message}\n\nLütfen Ollama servisinin çalıştığından emin ol.` 
      },
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, duration: '0' }
    });
  }
}
