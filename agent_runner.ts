import ollama from 'ollama';
import plugin from './src/index';

// Configuration
const nodeUrl = process.env.GITLAWB_NODE || "https://node.gitlawb.com";
const context = { directory: process.cwd() };
const model = "llama3.1"; 
const MOCK_MODE = true; // GitLawb CLI yüklü değilse simülasyonu aktif et

async function startAgent() {
  console.log("-----------------------------------------");
  console.log("🚀 GitLawb Local AI Agent - Otonom Ajan");
  if (MOCK_MODE) console.log("⚠️  MOD: Simülasyon (MOCK)");
  console.log("-----------------------------------------");
  
  // 1. Plugin'deki araçları alalım
  const gitlawbPlugin = await (plugin.server as any)({}, { nodeUrl });
  const tools = gitlawbPlugin.tool;

  console.log("✅ Yüklenen Araçlar:", Object.keys(tools).join(", "));

  async function executeTool(name: string, args: any) {
    console.log(`\n🛠️  Araç Çağrılıyor: ${name}(${JSON.stringify(args)})`);
    
    if (MOCK_MODE) {
        // Simülasyon cevapları
        const mocks: any = {
            gitlawb_whoami: "DID: did:key:z6Mk...omercan, Name: omercan, Node: https://node.gitlawb.com",
            gitlawb_doctor: "✅ All checks passed! Identity: OK, Connectivity: OK, Git: OK",
            gitlawb_bounty_list: JSON.stringify([
                { id: "1", title: "Add unit tests to helper.ts", amount: "500 GLB", status: "open" },
                { id: "2", title: "Implement dark mode for dashboard", amount: "1200 GLB", status: "open" }
            ])
        };
        return mocks[name] || `OK: ${name} (Mocked)`;
    }

    try {
      const result = await tools[name].execute(args, context);
      return result;
    } catch (error: any) {
      if (error.message.includes("Cannot find path") || error.message.includes("failed (exit 1)")) {
        return `HATA: GitLawb CLI ('gl') yüklü değil veya bulunamadı. Lütfen 'gl' binary'sini yolunuza ekleyin.`;
      }
      return `HATA: ${error.message}`;
    }
  }

  // 2. Basit bir Otonom Döngü (ReAct)
  async function runTask(task: string) {
    const messages = [
      { 
        role: 'system', 
        content: `Sen GitLawb protokolü üzerinde çalışan bir yardımcı ajansın. 
Görevin: Kullanıcının isteklerini mevcut araçları kullanarak yerine getirmek.
Mevcut Araçlar: ${Object.keys(tools).join(", ")}

Kurallar:
1. Önce düşün (THOUGHT), sonra hangi aracı çağıracağına karar ver.
2. Aracı çağırırken JSON formatında çıktı ver: ACTION: tool_name, ARGS: { ... }
3. Araç sonucuna göre bir sonraki adımı planla.`
      },
      { role: 'user', content: task }
    ];

    console.log(`\n📝 GÖREV: ${task}\n`);

    // Basit 3 adımlı bir döngü
    for (let i = 0; i < 3; i++) {
        const response = await ollama.chat({ model: model, messages: messages });
        const content = response.message.content;
        console.log(`🤖 Düşünce: ${content}`);

        // Basit bir regex ile Action yakalayalım (Gelişmiş ajanlarda bu yapı daha sağlamdır)
        const actionMatch = content.match(/ACTION: (\w+)/);
        const argsMatch = content.match(/ARGS: ({.+})/);

        if (actionMatch && argsMatch) {
            const toolName = actionMatch[1];
            const args = JSON.parse(argsMatch[1]);
            
            const observation = await executeTool(toolName, args);
            console.log(`👁️  Gözlem: ${observation}`);
            
            messages.push({ role: 'assistant', content: content });
            messages.push({ role: 'user', content: `OBSERVATION: ${observation}` });
        } else {
            console.log("\n✅ Görev tamamlandı veya AJAN karar veremedi.");
            break;
        }
    }
  }

  // Örnek bir görev başlatalım
  await runTask("GitLawb kimliğimi kontrol et.");
}

startAgent().catch((err) => {
    console.error("❌ HATA:", err.message);
    if (err.message.includes("fetch failed")) {
        console.log("💡 Tavsiye: Ollama'nın çalıştığından emin ol (ollama serve).");
    }
});
