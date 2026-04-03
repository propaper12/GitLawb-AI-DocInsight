import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import ollama from 'ollama';
import { sendToKafka } from './kafka';
import { uploadToMinio, getFromMinio } from './minio';
import { upsertToQdrant, searchQdrant, initQdrantCollection } from './qdrant';

const GL_BIN = process.env.GITLAWB_CLI ?? 'gl';
const MOCK_MODE = process.env.GITLAWB_MOCK === 'true' || true; // Default to true for safety

export async function executeGl(args: string[], cwd: string = process.cwd()): Promise<string> {
  if (MOCK_MODE) {
    if (args[0] === 'whoami') return "DID: did:key:z6Mk...omercan, Name: omercan, Node: https://node.gitlawb.com";
    if (args[0] === 'doctor') return "✅ All checks passed! Identity: OK, Connectivity: OK, Git: OK";
    if (args[0] === 'bounty' && args[1] === 'list') {
        return JSON.stringify([
            { id: "1", title: "Add unit tests to helper.ts", amount: "500 GLB", status: "open" },
            { id: "2", title: "Implement dark mode for dashboard", amount: "1200 GLB", status: "open" }
        ]);
    }
    return `OK: gl ${args.join(' ')} (Simulated)`;
  }

  return new Promise((resolve, reject) => {
    const child = spawn(GL_BIN, args, { cwd, env: process.env });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => stdout += data);
    child.stderr.on('data', (data) => stderr += data);

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`gl ${args.join(' ')} failed (exit ${code}):\n${stderr || stdout}`));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

export const TOOLS = {
  gitlawb_whoami: {
    description: "Show the current gitlawb identity (DID, registered name, node URL).",
    execute: () => executeGl(['whoami'])
  },
  gitlawb_doctor: {
    description: "Run gitlawb health check.",
    execute: () => executeGl(['doctor'])
  },
  gitlawb_bounty_list: {
    description: "List bounties. args: { status?: 'open'|'claimed'|'submitted'|'completed' }",
    execute: (args: any) => {
        const cmd = ['bounty', 'list'];
        if (args.status) cmd.push('--status', args.status);
        return executeGl(cmd);
    }
  },
  gitlawb_bounty_claim: {
    description: "Claim an open bounty. args: { id: string }",
    execute: (args: any) => executeGl(['bounty', 'claim', args.id])
  },
  write_file: {
    description: "Write content to a file. args: { filename: string, content: string }",
    execute: async (args: any) => {
      try {
        const fullPath = path.resolve(process.cwd(), args.filename);
        if (!fullPath.startsWith(process.cwd())) {
          throw new Error("Sadece proje klasörü içine dosya yazılabilir.");
        }
        await fs.promises.writeFile(fullPath, args.content, 'utf8');
        return `✅ Dosya başarıyla oluşturuldu: ${args.filename}`;
      } catch (err: any) {
        throw new Error(`Dosya yazma hatası: ${err.message}`);
      }
    }
  },
  read_file: {
    description: "Read content from a file. args: { filename: string }",
    execute: async (args: any) => {
      try {
        const fullPath = path.resolve(process.cwd(), args.filename);
        if (!fullPath.startsWith(process.cwd())) {
           throw new Error("Sadece proje klasörü içindeki dosyalar okunabilir.");
        }
        return await fs.promises.readFile(fullPath, 'utf8');
      } catch (err: any) {
        throw new Error(`Dosya okuma hatası: ${err.message}`);
      }
    }
  },
  data_ingest: {
    description: "Send data to Kafka and store in MinIO. args: { topic: string, content: string, filename: string }",
    execute: async (args: any) => {
      try {
        const kafkaStatus = await sendToKafka(args.topic, { content: args.content, filename: args.filename, timestamp: new Date() });
        const tmpPath = path.join(process.cwd(), 'tmp', args.filename);
        if (!fs.existsSync(path.join(process.cwd(), 'tmp'))) fs.mkdirSync(path.join(process.cwd(), 'tmp'));
        fs.writeFileSync(tmpPath, args.content);
        const minioStatus = await uploadToMinio('gitlawb-documents', args.filename, tmpPath);
        await initQdrantCollection('documents');
        const embedResponse = await ollama.embeddings({ model: 'nomic-embed-text', prompt: args.content });
        await upsertToQdrant('documents', [{
          id: Math.floor(Math.random() * 1000000),
          vector: embedResponse.embedding,
          payload: { filename: args.filename, content: args.content.substring(0, 1000) }
        }]);
        return `${kafkaStatus}\n${minioStatus}\n✅ Vector summary stored in Qdrant.`;
      } catch (err: any) {
        return `Pipeline Error: ${err.message}`;
      }
    }
  },
  data_search: {
    description: "Vektör veri tabanında (Qdrant) semantik arama yaparak yüklenen tüm belgelerden ilgili bilgileri bulur. Büyük veri setlerinden rapor hazırlamak ve çapraz analiz yapmak için kullanılır. args: { query: string }",
    execute: async (args: any) => {
      try {
        const embedResponse = await ollama.embeddings({ model: 'nomic-embed-text', prompt: args.query });
        const results = await searchQdrant('documents', embedResponse.embedding, 3);
        return JSON.stringify(results.map(r => ({ score: r.score, filename: r.payload?.filename, snippet: r.payload?.content })));
      } catch (err: any) {
        return `Search Error: ${err.message}`;
      }
    }
  },
  data_analyze: {
    description: "MinIO üzerinde saklanan belirli bir belgeyi derinlemesine analiz eder. Belgenin özetini çıkarır, kritik bilgileri saptar ve iş içgörüsü oluşturur. args: { filename: string, task: string }",
    execute: async (args: any) => {
      try {
        const content = await getFromMinio('gitlawb-documents', args.filename);
        const response = await ollama.chat({
          model: 'llama3.1',
          messages: [{ role: 'user', content: `Perform the following task on this document: ${args.task}. Document content: ${content.substring(0, 5000)}` }]
        });
        return response.message.content;
      } catch (err: any) {
        return `Analysis Error: ${err.message}`;
      }
    }
  }
};
