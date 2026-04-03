import { NextResponse } from 'next/server';
import ollama from 'ollama';
import { TOOLS } from '@/lib/gitlawb';

export async function POST(req: Request) {
  try {
    const { task, model } = await req.json();
    
    const messages = [
      { 
        role: 'system', 
        content: `You are GitLawb AI, a world-class Enterprise Data Analyst and Autonomous AI Research Agent.
Your goal is to fulfill the user's data-driven requests (document analysis, market research, trend extraction, summarization) using the big data pipeline (Kafka-MinIO-Qdrant).

AVAILABLE TOOLS: ${Object.keys(TOOLS).join(", ")}

RULES:
1. FOCUS: Professional analysis, insight extraction, and reporting. You are NO LONGER a coding agent. Do NOT write code or build applications.
2. THINK first (THOUGHT: ...), then act (ACTION: tool_name, ARGS: { ... }).
3. TOOLS: Use 'data_search' for searching the vector DB and 'data_analyze' for deep analysis of specific documents (stored in MinIO).
4. FINAL ANSWER: Provide a comprehensive, structured, and insight-dense report.
5. If a tool fails, analyze why and try another data tool.`
      },
      { role: 'user', content: task }
    ];

    const traces: any[] = [];
    let finalAnswer = '';

    // Maximum 5 steps to avoid infinite loops
    for (let i = 0; i < 5; i++) {
        const response = await ollama.chat({ 
          model: model || 'llama3.1', 
          messages: messages,
          options: { temperature: 0.1 } // Lower temperature for more consistent tool calling
        });
        
        const content = response.message.content;
        traces.push({ step: i + 1, content: content });

        // Parse Action
        const actionMatch = content.match(/ACTION: (\w+)/);
        const argsMatch = content.match(/ARGS: ({.+})/);

        if (actionMatch && argsMatch) {
            const toolName = actionMatch[1];
            const args = JSON.parse(argsMatch[1]);
            
            try {
                const observation = await (TOOLS as any)[toolName].execute(args);
                traces[traces.length - 1].observation = observation;
                
                messages.push({ role: 'assistant', content: content });
                messages.push({ role: 'user', content: `OBSERVATION: ${observation}` });
            } catch (err: any) {
                messages.push({ role: 'user', content: `HATA: ${err.message}` });
            }
        } else if (content.includes('FINAL ANSWER:')) {
            finalAnswer = content.split('FINAL ANSWER:')[1].trim();
            break;
        } else {
            // No action and no final answer, agent might be stuck
            finalAnswer = content;
            break;
        }
    }

    return NextResponse.json({ 
      success: true,
      traces: traces,
      finalAnswer: finalAnswer || "Görev tamamlandı."
    });

  } catch (error: any) {
    console.error('Agent Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
