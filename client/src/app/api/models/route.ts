import { NextResponse } from 'next/server';
import ollama from 'ollama';

export async function GET() {
  try {
    const response = await ollama.list();
    return NextResponse.json({ 
      models: response.models.map(m => ({
        name: m.name,
        size: m.size,
        details: m.details
      }))
    });
  } catch (error: any) {
    console.error('Ollama list error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
